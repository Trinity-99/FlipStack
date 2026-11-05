import { readonly, ref, shallowRef } from 'vue'
import { AuthenticationError } from '@/data/authenticationError'
import type {
  CardRowWithTagIds,
  DeckPreferenceRow,
  DeckRow,
  DirectionRow,
  GlobalSyncData,
  LocalProgressRow,
  ProfileRow,
  ProgressRow,
  SyncUnit,
  TagRow,
} from '@/data/dataTypes'
import {
  RemoteSource,
  type CardInput,
  type DeckInput,
  type DirectionInput,
  type TagInput,
} from '@/data/remoteSource'
import { LocalSource } from '@/data/localSource'

export const SYNC_DEADLINE_MS = 10000
const PUSH_BATCH_SIZE = 100

export interface SyncStatus {
  online: boolean
  syncing: boolean
  pending: boolean
  abandoned: boolean
}

/**
 * @summary Represents a content write that cannot complete without a connection.
 * @param {string} message - A user-safe description of the failure.
 * @param {unknown} originalError - The source failure, when available.
 */
export class OfflineError extends Error {
  /**
   * @summary Creates an offline-only content operation error.
   * @param {string} message - A user-safe description of the failure.
   * @param {unknown} originalError - The source failure, when available.
   */
  constructor(
    message = 'Please connect to the Internet — offline data entry is not supported',
    public readonly originalError?: unknown,
  ) {
    super(message)
    this.name = 'OfflineError'
  }
}

/**
 * @summary Signals that startup sync failed before a local mirror was available.
 */
export class StartupSyncError extends Error {
  /**
   * @summary Creates the startup sync failure.
   * @param {string} message - The retry-screen message.
   */
  constructor(message = 'Connect to the internet to load your decks') {
    super(message)
    this.name = 'StartupSyncError'
  }
}

/**
 * @summary Coordinates source selection, content synchronization, and connection status.
 * @param {LocalSource} localSource - The local mirror source.
 * @param {RemoteSource} remoteSource - The Supabase source.
 */
export class DataRouter {
  private readonly _status = shallowRef<SyncStatus>({
    online: typeof navigator === 'undefined' || navigator.onLine,
    syncing: false,
    pending: false,
    abandoned: false,
  })
  private readonly _isStartupLoading = ref(false)
  private readonly _isDeckLoading = ref(false)
  private readonly _startupError = shallowRef<string | null>(null)
  private readonly _startupLoading = readonly(this._isStartupLoading)
  private readonly _deckLoading = readonly(this._isDeckLoading)
  private readonly _statusView = readonly(this._status)
  private readonly _startupErrorView = readonly(this._startupError)
  private currentUserId: string | null = null
  private startedNetworkMonitoring = false
  private readonly syncedDeckIds = new Set<string>()
  private pendingPush: Promise<void> | null = null

  /**
   * @summary Creates a router with injectable local and remote sources.
   * @param {LocalSource} localSource - The local mirror source.
   * @param {RemoteSource} remoteSource - The Supabase source.
   */
  constructor(
    private readonly localSource: LocalSource = new LocalSource(),
    private readonly remoteSource: RemoteSource = new RemoteSource(),
  ) {}

  /**
   * @summary Gets the readonly synchronization status.
   * @returns {Readonly<typeof this._statusView>} Reactive status state.
   */
  public get status(): Readonly<typeof this._statusView> {
    return this._statusView
  }

  /**
   * @summary Gets whether blocking startup loading is active.
   * @returns {Readonly<typeof this._startupLoading>} Reactive startup state.
   */
  public get isStartupLoading(): Readonly<typeof this._startupLoading> {
    return this._startupLoading
  }

  /**
   * @summary Gets whether a deck switch is loading.
   * @returns {Readonly<typeof this._deckLoading>} Reactive deck loading state.
   */
  public get isDeckLoading(): Readonly<typeof this._deckLoading> {
    return this._deckLoading
  }

  /**
   * @summary Gets the blocking startup error, when present.
   * @returns {Readonly<typeof this._startupErrorView>} Reactive startup error state.
   */
  public get startupError(): Readonly<typeof this._startupErrorView> {
    return this._startupErrorView
  }

  /**
   * @summary Gets the router's connection state.
   * @returns {boolean} True when the browser is currently considered online.
   */
  public get isOnline(): boolean {
    return this._status.value.online
  }

  /**
   * @summary Opens local storage and returns its current owner.
   * @returns {Promise<string | null>} The local owner ID, or null when unset.
   */
  public async getLocalOwnerUserId(): Promise<string | null> {
    await this.localSource.open()
    return this.localSource.getOwnerUserId()
  }

  /**
   * @summary Finds the locally mirrored profile for the supplied user.
   * @param {string} userId - The authenticated user ID.
   * @returns {Promise<ProfileRow | null>} The local row or null.
   */
  public async findProfileById(userId: string): Promise<ProfileRow | null> {
    await this.localSource.open()
    return this.localSource.findProfileById(userId)
  }

  /**
   * @summary Restores or clears the local mirror according to its user owner.
   * @param {string} userId - The authenticated user ID.
   * @returns {Promise<void>} A promise that resolves after owner isolation.
   */
  public async restoreUser(userId: string): Promise<void> {
    await this.localSource.open()
    const ownerId = await this.localSource.getOwnerUserId()
    if (ownerId && ownerId !== userId) {
      await this.localSource.clear()
      this.syncedDeckIds.clear()
    }
    this.currentUserId = userId
  }

  /**
   * @summary Prepares an authenticated user's mirror before profile reads.
   * @param {string} userId - The authenticated user ID.
   * @returns {Promise<void>} A promise that resolves when the mirror is ready.
   * @throws {StartupSyncError} If no mirror exists and online sync cannot complete.
   */
  public async prepareAuthenticatedUser(userId: string): Promise<void> {
    await this.restoreUser(userId)
    if (this.isOnline) {
      await this.syncAtStartup(userId)
      return
    }
    const profile = await this.localSource.findProfileById(userId)
    if (!profile) throw new StartupSyncError()
  }

  /**
   * @summary Reads a deck row from the mirror.
   * @param {string} deckId - The deck ID.
   * @returns {Promise<DeckRow | null>} The deck row or null.
   */
  public async findDeckById(deckId: string): Promise<DeckRow | null> {
    return this.localSource.findDeckById(deckId)
  }

  /**
   * @summary Reads a user's decks from the mirror.
   * @param {string} userId - The user ID.
   * @returns {Promise<DeckRow[]>} The locally mirrored decks.
   */
  public async findDecksForUser(userId: string): Promise<DeckRow[]> {
    return this.localSource.findDecksForUser(userId)
  }

  /**
   * @summary Reads a card from the mirror.
   * @param {string} cardId - The card ID.
   * @returns {Promise<CardRowWithTagIds | null>} The local card row or null.
   */
  public async findCardById(cardId: string): Promise<CardRowWithTagIds | null> {
    return this.localSource.findCardById(cardId)
  }

  /**
   * @summary Reads all cards for a deck from the mirror.
   * @param {string} deckId - The deck ID.
   * @returns {Promise<CardRowWithTagIds[]>} The local card rows.
   */
  public async findCardsForDeck(deckId: string): Promise<CardRowWithTagIds[]> {
    return this.localSource.findCardsForDeck(deckId)
  }

  /**
   * @summary Reads a tag from the mirror.
   * @param {string} tagId - The tag ID.
   * @returns {Promise<TagRow | null>} The local tag row or null.
   */
  public async findTagById(tagId: string): Promise<TagRow | null> {
    return this.localSource.findTagById(tagId)
  }

  /**
   * @summary Reads a deck's tags from the mirror.
   * @param {string} deckId - The deck ID.
   * @returns {Promise<TagRow[]>} The local tag rows.
   */
  public async findTagsForDeck(deckId: string): Promise<TagRow[]> {
    return this.localSource.findTagsForDeck(deckId)
  }

  /**
   * @summary Reads a direction from the mirror.
   * @param {string} directionId - The direction ID.
   * @returns {Promise<DirectionRow | null>} The local direction row or null.
   */
  public async findDirectionById(directionId: string): Promise<DirectionRow | null> {
    return this.localSource.findDirectionById(directionId)
  }

  /**
   * @summary Reads a deck's saved directions from the mirror.
   * @param {string} deckId - The deck ID.
   * @returns {Promise<DirectionRow[]>} The local direction rows.
   */
  public async findDirectionsForDeck(deckId: string): Promise<DirectionRow[]> {
    return this.localSource.findDirectionsForDeck(deckId)
  }

  /**
   * @summary Reads progress for a user, card, and direction from the mirror.
   * @param {string} userId - The user ID.
   * @param {string} cardId - The card ID.
   * @param {string} directionId - The direction ID.
   * @returns {Promise<ProgressRow | null>} The local progress row or null.
   */
  public async findProgressForUserCardAndDirection(
    userId: string,
    cardId: string,
    directionId: string,
  ): Promise<ProgressRow | null> {
    return this.localSource.findProgressForUserCardAndDirection(userId, cardId, directionId)
  }

  /**
   * @summary Reads progress for a user and direction from the mirror.
   * @param {string} userId - The user ID.
   * @param {string} directionId - The direction ID.
   * @returns {Promise<ProgressRow[]>} The local progress rows.
   */
  public async findProgressForUserAndDirection(
    userId: string,
    directionId: string,
  ): Promise<ProgressRow[]> {
    return this.localSource.findProgressForUserAndDirection(userId, directionId)
  }

  /**
   * @summary Saves a deck remotely and then mirrors the returned row.
   * @param {DeckInput} row - The validated deck data.
   * @returns {Promise<DeckRow>} The server row.
   */
  public async saveDeck(row: DeckInput): Promise<DeckRow> {
    const saved = await this.saveContent(() => this.remoteSource.saveDeck(row))
    await this.localSource.saveDeck(saved)
    return saved
  }

  /**
   * @summary Saves a card and its tag links remotely, then mirrors the returned row.
   * @param {CardInput} row - The validated card and tag IDs.
   * @returns {Promise<CardRowWithTagIds>} The server row with tag IDs.
   */
  public async saveCard(row: CardInput): Promise<CardRowWithTagIds> {
    const saved = await this.saveContent(() => this.remoteSource.saveCard(row))
    await this.localSource.saveCard(saved)
    return saved
  }

  /**
   * @summary Saves a tag remotely and then mirrors the returned row.
   * @param {TagInput} row - The validated tag.
   * @returns {Promise<TagRow>} The server row.
   */
  public async saveTag(row: TagInput): Promise<TagRow> {
    const saved = await this.saveContent(() => this.remoteSource.saveTag(row))
    await this.localSource.saveTag(saved)
    return saved
  }

  /**
   * @summary Saves a direction remotely and then mirrors the returned row.
   * @param {DirectionInput} row - The validated direction.
   * @returns {Promise<DirectionRow>} The server row.
   */
  public async saveDirection(row: DirectionInput): Promise<DirectionRow> {
    const saved = await this.saveContent(() => this.remoteSource.saveDirection(row))
    await this.localSource.saveDirection(saved)
    return saved
  }

  /**
   * @summary Deletes a deck remotely and then mirrors the cascade.
   * @param {string} id - The deck ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteDeck(id: string): Promise<void> {
    await this.deleteContent(() => this.remoteSource.deleteDeck(id))
    await this.localSource.deleteDeck(id)
  }

  /**
   * @summary Deletes a card remotely and then mirrors the cascade.
   * @param {string} id - The card ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteCard(id: string): Promise<void> {
    await this.deleteContent(() => this.remoteSource.deleteCard(id))
    await this.localSource.deleteCard(id)
  }

  /**
   * @summary Deletes a tag remotely and then clears its local references.
   * @param {string} id - The tag ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteTag(id: string): Promise<void> {
    await this.deleteContent(() => this.remoteSource.deleteTag(id))
    await this.localSource.deleteTag(id)
  }

  /**
   * @summary Deletes a direction remotely and then mirrors the cascade.
   * @param {string} id - The direction ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteDirection(id: string): Promise<void> {
    await this.deleteContent(() => this.remoteSource.deleteDirection(id))
    await this.localSource.deleteDirection(id)
  }

  /**
   * @summary Saves the active-deck setting locally and marks it pending.
   * @param {ProfileRow} row - The updated profile settings.
   * @returns {Promise<ProfileRow>} The stored local row.
   */
  public async saveProfileSettings(row: ProfileRow): Promise<ProfileRow> {
    const saved = await this.localSource.saveProfileSettings(row)
    await this.refreshPendingStatus()
    if (this.isOnline) this.startBackgroundPush()
    return saved
  }

  /**
   * @summary Saves per-deck settings locally and marks them pending.
   * @param {DeckPreferenceRow} row - The updated deck preference.
   * @returns {Promise<DeckPreferenceRow>} The stored local preference.
   */
  public async saveDeckPreference(row: DeckPreferenceRow): Promise<DeckPreferenceRow> {
    const saved = await this.localSource.saveDeckPreference(row)
    await this.refreshPendingStatus()
    if (this.isOnline) this.startBackgroundPush()
    return saved
  }

  /**
   * @summary Saves a swipe locally and starts a non-blocking online push.
   * @param {ProgressRow} row - The new progress value.
   * @returns {Promise<ProgressRow>} The saved local row with its ID.
   */
  public async saveProgress(row: ProgressRow): Promise<ProgressRow> {
    const saved = await this.localSource.saveProgress(row)
    this._status.value = { ...this._status.value, pending: true }
    if (this.isOnline) this.startBackgroundPush()
    return saved
  }

  /**
   * @summary Resets selected progress rows locally and marks them pending.
   * @param {string} userId - The user ID.
   * @param {string[]} cardIds - The eligible card IDs.
   * @param {string} directionId - The direction ID.
   * @returns {Promise<void>} A promise that resolves after the local reset.
   */
  public async resetProgress(
    userId: string,
    cardIds: string[],
    directionId: string,
  ): Promise<void> {
    await this.localSource.resetProgress(userId, cardIds, directionId, new Date().toISOString())
    await this.refreshPendingStatus()
    if (this.isOnline) this.startBackgroundPush()
  }

  /**
   * @summary Deletes progress remotely and removes it from the local mirror.
   * @param {string} id - The progress row ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteProgress(id: string): Promise<void> {
    if (!this.isOnline) throw new OfflineError()
    await this.remoteSource.deleteProgress(id)
    await this.localSource.deleteProgress(id)
  }

  /**
   * @summary Proxies a Supabase password sign-in through the remote source.
   * @param {{ email: string; password: string }} credentials - The validated credentials.
   * @returns {Promise<Awaited<ReturnType<RemoteSource['signInWithPassword']>>>} Auth result.
   */
  public async signInWithPassword(credentials: {
    email: string
    password: string
  }): Promise<Awaited<ReturnType<RemoteSource['signInWithPassword']>>> {
    return this.remoteSource.signInWithPassword(credentials)
  }

  /**
   * @summary Proxies account signup through the remote source.
   * @param {{ email: string; password: string }} credentials - The validated signup credentials.
   * @param {string} emailRedirectTo - The application callback URL.
   * @returns {Promise<void>} A promise that resolves when the signup request completes.
   */
  public async signUp(
    credentials: { email: string; password: string },
    emailRedirectTo: string,
  ): Promise<void> {
    return this.remoteSource.signUp(credentials, emailRedirectTo)
  }

  /**
   * @summary Proxies confirmation callback processing through the remote source.
   * @returns {Promise<void>} A promise that resolves after confirmation cleanup.
   */
  public async completeEmailConfirmation(): Promise<void> {
    return this.remoteSource.completeEmailConfirmation()
  }

  /**
   * @summary Proxies persisted-session restoration through the remote source.
   * @returns {Promise<Awaited<ReturnType<RemoteSource['getSession']>>>} Session result.
   */
  public async getSession(): Promise<Awaited<ReturnType<RemoteSource['getSession']>>> {
    return this.remoteSource.getSession()
  }

  /**
   * @summary Proxies local-session sign-out through the remote source.
   * @returns {Promise<{ remoteRevocationPending: boolean }>} Whether remote revocation failed.
   */
  public async signOut(): Promise<Awaited<ReturnType<RemoteSource['signOut']>>> {
    return this.remoteSource.signOut()
  }

  /**
   * @summary Pushes pending progress and settings changes.
   * @param {AbortSignal} [signal] - Optional cancellation signal for bounded sync operations.
   * @returns {Promise<void>} A promise that resolves after pending work is processed.
   */
  public async pushPendingChanges(signal?: AbortSignal): Promise<void> {
    if (this.pendingPush) return this.pendingPush
    const task = this.pushPendingChangesInternal(signal)
    this.pendingPush = task
    try {
      await task
    } finally {
      if (this.pendingPush === task) this.pendingPush = null
      await this.refreshPendingStatus()
    }
  }

  /**
   * @summary Synchronizes the active deck and global data before releasing startup.
   * @param {string} userId - The authenticated user ID.
   * @returns {Promise<void>} A promise that resolves when startup data is available.
   * @throws {StartupSyncError} If no local mirror exists and sync fails.
   */
  public async syncAtStartup(userId: string): Promise<void> {
    await this.localSource.open()
    this._isStartupLoading.value = true
    this._startupError.value = null
    this._status.value = { ...this._status.value, syncing: true, abandoned: false }
    try {
      if (!this.isOnline) {
        const localProfile = await this.localSource.findProfileById(userId)
        if (!localProfile) throw new StartupSyncError()
        return
      }

      const { unit, remainingDecks } = await this.withDeadline(async (signal) => {
        await this.pushPendingChangesInternal(signal)
        const global = await this.remoteSource.downloadGlobalData(userId, signal)
        const activeDeck =
          global.decks.find((deck) => deck.id === global.profile.last_active_deck_id) ??
          [...global.decks].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ??
          null
        const deckData = activeDeck
          ? await this.remoteSource.downloadDeckData(activeDeck, signal)
          : null
        const unit: SyncUnit = { global, deck: deckData }
        return {
          unit,
          remainingDecks: global.decks.filter((deck) => deck.id !== activeDeck?.id),
        }
      })

      await this.localSource.replaceSyncUnit(unit)
      this.currentUserId = userId
      if (unit.deck) this.syncedDeckIds.add(unit.deck.id)
      this._startupError.value = null
      if (remainingDecks.length > 0) {
        this.startBackgroundDeckSync(unit.global, remainingDecks)
      }
    } catch (error: unknown) {
      this.markSyncFailure(error)
      console.error('DataRouter startup sync failed; continuing with the local mirror:', error)
      const localProfile = await this.localSource.findProfileById(userId)
      if (!localProfile) {
        this._startupError.value = 'Connect to the internet to load your decks'
        throw new StartupSyncError()
      }
    } finally {
      this._isStartupLoading.value = false
      this._status.value = { ...this._status.value, syncing: false }
      await this.refreshPendingStatus()
    }
  }

  /**
   * @summary Prepares a deck before changing the active deck context.
   * @param {string} deckId - The deck to load.
   * @returns {Promise<void>} A promise that resolves when the deck is ready locally.
   */
  public async prepareDeckSwitch(deckId: string): Promise<void> {
    if (this.syncedDeckIds.has(deckId)) {
      void this.pushPendingChanges().catch((error: unknown) =>
        console.error('DataRouter deck-switch pending push failed:', error),
      )
      return
    }

    this._isDeckLoading.value = true
    this._status.value = { ...this._status.value, syncing: true, abandoned: false }
    try {
      const { global, deckData } = await this.withDeadline(async (signal) => {
        await this.pushPendingChanges(signal)
        const global = await this.remoteSource.downloadGlobalData(
          this.currentUserId ?? '',
          signal,
        )
        const deck = global.decks.find((row) => row.id === deckId)
        if (!deck) throw new Error(`Deck ${deckId} is not available in the remote deck list.`)
        const deckData = await this.remoteSource.downloadDeckData(deck, signal)
        return { global, deckData }
      })
      await this.localSource.replaceSyncUnit({ global, deck: deckData })
      this.syncedDeckIds.add(deckId)
    } catch (error: unknown) {
      this.markSyncFailure(error)
      console.error(`DataRouter deck switch sync failed for ${deckId}:`, error)
      const localDeck = await this.localSource.findDeckById(deckId)
      if (!localDeck) throw error
    } finally {
      this._isDeckLoading.value = false
      this._status.value = { ...this._status.value, syncing: false }
      await this.refreshPendingStatus()
    }
  }

  /**
   * @summary Retries a startup sync after the local-copy error state.
   * @returns {Promise<void>} A promise that resolves when retry completes.
   * @throws {StartupSyncError} If no local mirror exists and sync still fails.
   */
  public async retryStartupSync(): Promise<void> {
    const userId = this.currentUserId ?? (await this.localSource.getOwnerUserId())
    if (!userId) throw new StartupSyncError()
    await this.syncAtStartup(userId)
  }

  /**
   * @summary Registers online/offline listeners once and pushes pending changes on reconnect.
   * @returns {void}
   */
  public startNetworkMonitoring(): void {
    if (this.startedNetworkMonitoring || typeof window === 'undefined') return
    this.startedNetworkMonitoring = true
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)
  }

  private readonly handleOnline = (): void => {
    this._status.value = { ...this._status.value, online: true }
    this.startBackgroundPush()
  }

  private readonly handleOffline = (): void => {
    this._status.value = { ...this._status.value, online: false }
  }

  private async saveContent<T>(save: () => Promise<T>): Promise<T> {
    if (!this.isOnline) throw new OfflineError()
    try {
      return await save()
    } catch (error: unknown) {
      this.updateConnectionFromError(error)
      throw new OfflineError(undefined, error)
    }
  }

  private async deleteContent(remove: () => Promise<void>): Promise<void> {
    if (!this.isOnline) throw new OfflineError()
    try {
      await remove()
    } catch (error: unknown) {
      this.updateConnectionFromError(error)
      throw new OfflineError(undefined, error)
    }
  }

  private async pushPendingChangesInternal(signal?: AbortSignal): Promise<void> {
    await this.localSource.open()
    const pending = await this.localSource.getPendingChanges()
    this._status.value = { ...this._status.value, pending: true }
    try {
      for (let offset = 0; offset < pending.progress.length; offset += PUSH_BATCH_SIZE) {
        const batch = pending.progress.slice(offset, offset + PUSH_BATCH_SIZE)
        const remoteRows = await this.remoteSource.findProgressForUser(
          batch[0]?.user_id ?? '',
          batch.map((row) => row.card_id),
          batch.map((row) => row.direction_id),
          signal,
        )
        const remoteByKey = new Map(
          remoteRows.map((row) => [this.progressKey(row), row] as const),
        )
        const toPush: typeof batch = []
        for (const localRow of batch) {
          const remoteRow = remoteByKey.get(this.progressKey(localRow))
          if (!remoteRow || localRow.last_updated > remoteRow.last_updated) {
            toPush.push(localRow)
          } else {
            await this.localSource.reconcileProgress(localRow, remoteRow)
          }
        }
        if (toPush.length === 0) continue
        try {
          const savedRows = await this.remoteSource.upsertProgressBatch(
            toPush.map((row) => this.toRemoteProgress(row)),
            signal,
          )
          await this.reconcileReturnedProgress(toPush, savedRows)
        } catch (batchError: unknown) {
          if (this.isNetworkError(batchError)) throw batchError
          for (const row of toPush) {
            try {
              const savedRows = await this.remoteSource.upsertProgressBatch(
                [this.toRemoteProgress(row)],
                signal,
              )
              await this.reconcileReturnedProgress([row], savedRows)
            } catch (rowError: unknown) {
              if (this.isNetworkError(rowError)) throw rowError
              console.error(`DataRouter dropped rejected progress row ${row.id}:`, rowError)
              await this.localSource.dropRejectedProgress(row)
            }
          }
        }
      }

      for (const profile of pending.profiles) {
        try {
          const serverRow = await this.remoteSource.updateProfileSettings(profile)
          await this.localSource.reconcileProfileSettings(profile, serverRow)
        } catch (error: unknown) {
          if (this.isNetworkError(error)) throw error
          console.error(`DataRouter dropped rejected profile settings for ${profile.id}:`, error)
          await this.localSource.dropRejectedSettings(profile)
        }
      }
      for (const preference of pending.preferences) {
        try {
          await this.remoteSource.upsertDeckPreferences([preference])
          await this.localSource.acknowledgeSettings(preference)
        } catch (error: unknown) {
          if (this.isNetworkError(error)) throw error
          console.error(
            `DataRouter dropped rejected deck preference for ${preference.deck_id}:`,
            error,
          )
          await this.localSource.dropRejectedSettings(preference)
        }
      }
    } catch (error: unknown) {
      this.updateConnectionFromError(error)
      throw error
    }
  }

  private async reconcileReturnedProgress(
    snapshots: LocalProgressRow[],
    serverRows: ProgressRow[],
  ): Promise<void> {
    const byKey = new Map(serverRows.map((row) => [this.progressKey(row), row] as const))
    for (const snapshot of snapshots) {
      const serverRow = byKey.get(this.progressKey(snapshot))
      if (!serverRow) {
        throw new Error(`Supabase did not return progress row ${snapshot.card_id}.`)
      }
      await this.localSource.reconcileProgress(snapshot, serverRow)
    }
  }

  private startBackgroundPush(): void {
    void this.pushPendingChanges().catch((error: unknown) => {
      console.error('DataRouter background pending push failed:', error)
    })
  }

  private startBackgroundDeckSync(global: GlobalSyncData, decks: DeckRow[]): void {
    void this.syncRemainingDecks(global, decks).catch((error: unknown) => {
      this.markSyncFailure(error)
      console.error('DataRouter background deck sync failed:', error)
    })
  }

  private async syncRemainingDecks(global: GlobalSyncData, decks: DeckRow[]): Promise<void> {
    for (const deck of decks) {
      this._status.value = { ...this._status.value, syncing: true }
      try {
        const deckData = await this.withDeadline((signal) =>
          this.remoteSource.downloadDeckData(deck, signal),
        )
        await this.localSource.replaceSyncUnit({ global, deck: deckData })
        this.syncedDeckIds.add(deck.id)
      } catch (error: unknown) {
        this.updateConnectionFromError(error)
        this._status.value = { ...this._status.value, abandoned: true }
        throw error
      } finally {
        this._status.value = { ...this._status.value, syncing: false }
      }
    }
  }

  private async withDeadline<T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort()
        reject(new Error('Data sync exceeded SYNC_DEADLINE_MS.'))
      }, SYNC_DEADLINE_MS)
    })
    try {
      return await Promise.race([operation(controller.signal), deadline])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }

  private progressKey(row: Pick<ProgressRow, 'card_id' | 'direction_id'>): string {
    return `${row.card_id}:${row.direction_id}`
  }

  private toRemoteProgress(row: ProgressRow): ProgressRow {
    return {
      id: '',
      user_id: row.user_id,
      card_id: row.card_id,
      direction_id: row.direction_id,
      counter: row.counter,
      last_updated: row.last_updated,
    }
  }

  private updateConnectionFromError(error: unknown): void {
    if (this.isNetworkError(error)) {
      this._status.value = { ...this._status.value, online: false }
    }
  }

  private markSyncFailure(error: unknown): void {
    this.updateConnectionFromError(error)
    this._status.value = { ...this._status.value, abandoned: true }
  }

  private isNetworkError(error: unknown): boolean {
    return (
      (error instanceof AuthenticationError && error.kind === 'network') ||
      error instanceof TypeError ||
      (error instanceof Error &&
        ['AuthRetryableFetchError', 'FetchError', 'AbortError'].includes(error.name))
    )
  }

  private async refreshPendingStatus(): Promise<void> {
    const pending = await this.localSource.hasPendingChanges()
    this._status.value = { ...this._status.value, pending }
  }
}

/**
 * @summary Shared application data router.
 */
export const dataRouter = new DataRouter()
