import Dexie, { type Table } from 'dexie'
import type {
  CardRowWithTagIds,
  DeckPreferenceRow,
  DeckRow,
  DeckSyncData,
  DirectionRow,
  LocalDeckPreferenceRow,
  LocalProfileRow,
  LocalProgressRow,
  PendingChanges,
  ProfileRow,
  ProgressRow,
  SyncUnit,
  TagRow,
} from '@/data/dataTypes'

interface MetaRow {
  key: string
  value: string
}

class FlipStackDatabase extends Dexie {
  public readonly meta!: Table<MetaRow, string>
  public readonly profile!: Table<LocalProfileRow, string>
  public readonly user_deck_preference!: Table<LocalDeckPreferenceRow, [string, string]>
  public readonly deck!: Table<DeckRow, string>
  public readonly card!: Table<CardRowWithTagIds, string>
  public readonly tag!: Table<TagRow, string>
  public readonly direction!: Table<DirectionRow, string>
  public readonly card_progress!: Table<LocalProgressRow, string>

  constructor() {
    super('flipstack')
    this.version(1).stores({
      meta: 'key',
      profile: 'id, last_active_deck_id, pending',
      user_deck_preference:
        '[user_id+deck_id], user_id, deck_id, last_selected_direction_id, last_selected_tag_id, pending',
      deck: 'id, user_id',
      card: 'id, deck_id, user_id, *tag_ids',
      tag: 'id, deck_id',
      direction: 'id, deck_id',
      card_progress:
        'id, user_id, card_id, direction_id, [user_id+direction_id], &[user_id+card_id+direction_id], pending',
    })
    this.meta = this.table('meta')
    this.profile = this.table('profile')
    this.user_deck_preference = this.table('user_deck_preference')
    this.deck = this.table('deck')
    this.card = this.table('card')
    this.tag = this.table('tag')
    this.direction = this.table('direction')
    this.card_progress = this.table('card_progress')
  }
}

type SettingsSnapshot = LocalProfileRow | LocalDeckPreferenceRow

/**
 * @summary Owns all Dexie persistence for the user's offline mirror.
 */
export class LocalSource {
  private readonly database: FlipStackDatabase

  /**
   * @summary Creates the local IndexedDB source.
   */
  constructor() {
    this.database = new FlipStackDatabase()
  }

  /**
   * @summary Opens the database and applies pending schema upgrades.
   * @returns {Promise<void>} A promise that resolves when the database is ready.
   */
  public async open(): Promise<void> {
    await this.database.open()
  }

  /**
   * @summary Returns the user ID that owns this local mirror.
   * @returns {Promise<string | null>} The owner ID, or null when the mirror is unassigned.
   */
  public async getOwnerUserId(): Promise<string | null> {
    const owner = await this.database.meta.get('owner')
    return owner?.value ?? null
  }

  /**
   * @summary Assigns the local mirror to an authenticated user.
   * @param {string} userId - The authenticated user's ID.
   * @returns {Promise<void>} A promise that resolves after the owner is stored.
   */
  public async setOwnerUserId(userId: string): Promise<void> {
    await this.database.meta.put({ key: 'owner', value: userId })
  }

  /**
   * @summary Removes all records and ownership metadata from the local mirror.
   * @returns {Promise<void>} A promise that resolves when the mirror is empty.
   */
  public async clear(): Promise<void> {
    await this.database.transaction(
      'rw',
      [
        this.database.meta,
        this.database.profile,
        this.database.user_deck_preference,
        this.database.deck,
        this.database.card,
        this.database.tag,
        this.database.direction,
        this.database.card_progress,
      ],
      async () => {
        await Promise.all([
          this.database.meta.clear(),
          this.database.profile.clear(),
          this.database.user_deck_preference.clear(),
          this.database.deck.clear(),
          this.database.card.clear(),
          this.database.tag.clear(),
          this.database.direction.clear(),
          this.database.card_progress.clear(),
        ])
      },
    )
  }

  /**
   * @summary Finds a profile row and joins its locally stored deck preferences.
   * @param {string} userId - The profile ID.
   * @returns {Promise<ProfileRow | null>} The row, or null when not found.
   */
  public async findProfileById(userId: string): Promise<ProfileRow | null> {
    const profile = await this.database.profile.get(userId)
    if (!profile) return null
    const preferences = await this.database.user_deck_preference.where('user_id').equals(userId).toArray()
    const { pending: _pending, revision: _revision, ...row } = profile
    return { ...row, user_deck_preferences: preferences }
  }

  /**
   * @summary Finds a deck by ID.
   * @param {string} deckId - The deck ID.
   * @returns {Promise<DeckRow | null>} The deck row, or null when not found.
   */
  public async findDeckById(deckId: string): Promise<DeckRow | null> {
    return (await this.database.deck.get(deckId)) ?? null
  }

  /**
   * @summary Finds all decks owned by a user, newest first.
   * @param {string} userId - The owner ID.
   * @returns {Promise<DeckRow[]>} The user's deck rows.
   */
  public async findDecksForUser(userId: string): Promise<DeckRow[]> {
    const rows = await this.database.deck.where('user_id').equals(userId).toArray()
    return rows.sort((first, second) => second.created_at.localeCompare(first.created_at))
  }

  /**
   * @summary Finds a card with its embedded tag IDs.
   * @param {string} cardId - The card ID.
   * @returns {Promise<CardRowWithTagIds | null>} The card row, or null when not found.
   */
  public async findCardById(cardId: string): Promise<CardRowWithTagIds | null> {
    return (await this.database.card.get(cardId)) ?? null
  }

  /**
   * @summary Finds cards for a deck, newest first.
   * @param {string} deckId - The deck ID.
   * @returns {Promise<CardRowWithTagIds[]>} The deck's card rows.
   */
  public async findCardsForDeck(deckId: string): Promise<CardRowWithTagIds[]> {
    const rows = await this.database.card.where('deck_id').equals(deckId).toArray()
    return rows.sort((first, second) => second.created_at.localeCompare(first.created_at))
  }

  /**
   * @summary Finds a tag by ID.
   * @param {string} tagId - The tag ID.
   * @returns {Promise<TagRow | null>} The tag row, or null when not found.
   */
  public async findTagById(tagId: string): Promise<TagRow | null> {
    return (await this.database.tag.get(tagId)) ?? null
  }

  /**
   * @summary Finds a deck's tags in name order.
   * @param {string} deckId - The deck ID.
   * @returns {Promise<TagRow[]>} The deck's tag rows.
   */
  public async findTagsForDeck(deckId: string): Promise<TagRow[]> {
    const rows = await this.database.tag.where('deck_id').equals(deckId).toArray()
    return rows.sort((first, second) => first.name.localeCompare(second.name))
  }

  /**
   * @summary Finds a direction by ID.
   * @param {string} directionId - The direction ID.
   * @returns {Promise<DirectionRow | null>} The direction row, or null when not found.
   */
  public async findDirectionById(directionId: string): Promise<DirectionRow | null> {
    return (await this.database.direction.get(directionId)) ?? null
  }

  /**
   * @summary Finds a deck's directions in creation order.
   * @param {string} deckId - The deck ID.
   * @returns {Promise<DirectionRow[]>} The deck's direction rows.
   */
  public async findDirectionsForDeck(deckId: string): Promise<DirectionRow[]> {
    const rows = await this.database.direction.where('deck_id').equals(deckId).toArray()
    return rows.sort((first, second) => first.created_at.localeCompare(second.created_at))
  }

  /**
   * @summary Finds progress for a user, card, and direction tuple.
   * @param {string} userId - The user ID.
   * @param {string} cardId - The card ID.
   * @param {string} directionId - The direction ID.
   * @returns {Promise<ProgressRow | null>} The progress row, or null when not found.
   */
  public async findProgressForUserCardAndDirection(
    userId: string,
    cardId: string,
    directionId: string,
  ): Promise<ProgressRow | null> {
    const row = await this.database.card_progress
      .where('[user_id+card_id+direction_id]')
      .equals([userId, cardId, directionId])
      .first()
    return row ? this.toProgressRow(row) : null
  }

  /**
   * @summary Finds progress rows for one user and direction.
   * @param {string} userId - The user ID.
   * @param {string} directionId - The direction ID.
   * @returns {Promise<ProgressRow[]>} Matching progress rows.
   */
  public async findProgressForUserAndDirection(
    userId: string,
    directionId: string,
  ): Promise<ProgressRow[]> {
    const rows = await this.database.card_progress
      .where('[user_id+direction_id]')
      .equals([userId, directionId])
      .toArray()
    return rows.map((row) => this.toProgressRow(row))
  }

  /**
   * @summary Saves local profile settings and marks them pending.
   * @param {ProfileRow} row - The updated profile row.
   * @returns {Promise<ProfileRow>} The stored profile row.
   */
  public async saveProfileSettings(row: ProfileRow): Promise<ProfileRow> {
    const saved = await this.database.transaction('rw', this.database.profile, async () => {
      const current = await this.database.profile.get(row.id)
      if (!current) throw new Error(`Cannot update missing local profile ${row.id}.`)
      const updated: LocalProfileRow = {
        ...current,
        last_active_deck_id: row.last_active_deck_id,
        updated_at: row.updated_at,
        pending: 1,
        revision: current.revision + 1,
      }
      await this.database.profile.put(updated)
      return updated
    })
    return saved
  }

  /**
   * @summary Saves a local deck preference and marks it pending.
   * @param {DeckPreferenceRow} row - The updated preference.
   * @returns {Promise<DeckPreferenceRow>} The stored preference.
   */
  public async saveDeckPreference(row: DeckPreferenceRow): Promise<DeckPreferenceRow> {
    const key: [string, string] = [row.user_id, row.deck_id]
    const saved = await this.database.transaction(
      'rw',
      this.database.user_deck_preference,
      async () => {
        const current = await this.database.user_deck_preference.get(key)
        const updated: LocalDeckPreferenceRow = {
          ...row,
          pending: 1,
          revision: (current?.revision ?? 0) + 1,
        }
        await this.database.user_deck_preference.put(updated)
        return updated
      },
    )
    return saved
  }

  /**
   * @summary Stores a synchronized deck row.
   * @param {DeckRow} row - The remote deck row.
   * @returns {Promise<void>} A promise that resolves after the row is stored.
   */
  public async saveDeck(row: DeckRow): Promise<void> {
    await this.database.deck.put(row)
  }

  /**
   * @summary Stores a synchronized card row with its tag IDs.
   * @param {CardRowWithTagIds} row - The card row.
   * @returns {Promise<void>} A promise that resolves after the row is stored.
   */
  public async saveCard(row: CardRowWithTagIds): Promise<void> {
    await this.database.card.put(row)
  }

  /**
   * @summary Stores a synchronized tag row.
   * @param {TagRow} row - The tag row.
   * @returns {Promise<void>} A promise that resolves after the row is stored.
   */
  public async saveTag(row: TagRow): Promise<void> {
    await this.database.tag.put(row)
  }

  /**
   * @summary Stores a synchronized direction row.
   * @param {DirectionRow} row - The direction row.
   * @returns {Promise<void>} A promise that resolves after the row is stored.
   */
  public async saveDirection(row: DirectionRow): Promise<void> {
    await this.database.direction.put(row)
  }

  /**
   * @summary Saves local progress, assigning an ID and incrementing its pending revision.
   * @param {ProgressRow} row - The changed progress row.
   * @returns {Promise<LocalProgressRow>} The stored local row.
   */
  public async saveProgress(row: ProgressRow): Promise<LocalProgressRow> {
    return this.database.transaction('rw', this.database.card_progress, async () => {
      const key: [string, string, string] = [row.user_id, row.card_id, row.direction_id]
      const current = await this.database.card_progress
        .where('[user_id+card_id+direction_id]')
        .equals(key)
        .first()
      const saved: LocalProgressRow = {
        ...row,
        id: current?.id ?? (row.id || crypto.randomUUID()),
        pending: 1,
        revision: (current?.revision ?? 0) + 1,
      }
      await this.database.card_progress.put(saved)
      return saved
    })
  }

  /**
   * @summary Resets existing progress rows and marks them pending atomically.
   * @param {string} userId - The user ID.
   * @param {string[]} cardIds - The eligible card IDs.
   * @param {string} directionId - The direction ID.
   * @param {string} lastUpdated - The new update timestamp.
   * @returns {Promise<void>} A promise that resolves after all rows are updated.
   */
  public async resetProgress(
    userId: string,
    cardIds: string[],
    directionId: string,
    lastUpdated: string,
  ): Promise<void> {
    if (cardIds.length === 0) return
    await this.database.transaction('rw', this.database.card_progress, async () => {
      const rows = await this.database.card_progress
        .where('[user_id+direction_id]')
        .equals([userId, directionId])
        .filter((row) => cardIds.includes(row.card_id))
        .toArray()
      await this.database.card_progress.bulkPut(
        rows.map((row) => ({
          ...row,
          counter: 0,
          last_updated: lastUpdated,
          pending: 1 as const,
          revision: row.revision + 1,
        })),
      )
    })
  }

  /**
   * @summary Deletes a deck and its dependent local rows.
   * @param {string} deckId - The deck ID.
   * @returns {Promise<void>} A promise that resolves after the cascade completes.
   */
  public async deleteDeck(deckId: string): Promise<void> {
    await this.database.transaction(
      'rw',
      [
        this.database.profile,
        this.database.user_deck_preference,
        this.database.deck,
        this.database.card,
        this.database.tag,
        this.database.direction,
        this.database.card_progress,
      ],
      async () => {
        const directionIds = await this.database.direction
          .where('deck_id')
          .equals(deckId)
          .primaryKeys()
        const cards = await this.database.card.where('deck_id').equals(deckId).primaryKeys()
        await Promise.all([
          this.database.card_progress.where('direction_id').anyOf(directionIds).delete(),
          this.database.card.where('deck_id').equals(deckId).delete(),
          this.database.tag.where('deck_id').equals(deckId).delete(),
          this.database.direction.where('deck_id').equals(deckId).delete(),
          this.database.user_deck_preference.where('deck_id').equals(deckId).delete(),
          this.database.deck.delete(deckId),
          this.clearLastActiveDeck(deckId),
          this.database.card_progress.where('card_id').anyOf(cards).delete(),
        ])
      },
    )
  }

  /**
   * @summary Deletes a card and its progress rows.
   * @param {string} cardId - The card ID.
   * @returns {Promise<void>} A promise that resolves after the cascade completes.
   */
  public async deleteCard(cardId: string): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.card,
      this.database.card_progress,
      async () => {
        await this.database.card_progress.where('card_id').equals(cardId).delete()
        await this.database.card.delete(cardId)
      },
    )
  }

  /**
   * @summary Deletes a tag and clears its references in cards and preferences.
   * @param {string} tagId - The tag ID.
   * @returns {Promise<void>} A promise that resolves after the cascade completes.
   */
  public async deleteTag(tagId: string): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.profile,
      this.database.user_deck_preference,
      this.database.card,
      this.database.tag,
      async () => {
        const cards = await this.database.card.where('tag_ids').equals(tagId).toArray()
        await Promise.all(
          cards.map((card) =>
            this.database.card.put({
              ...card,
              tag_ids: card.tag_ids.filter((id) => id !== tagId),
            }),
          ),
        )
        const preferences = await this.database.user_deck_preference
          .where('last_selected_tag_id')
          .equals(tagId)
          .toArray()
        await Promise.all(
          preferences.map((preference) =>
            this.database.user_deck_preference.put({
              ...preference,
              last_selected_tag_id: null,
              pending: 0,
              revision: preference.revision + 1,
            }),
          ),
        )
        await this.database.tag.delete(tagId)
      },
    )
  }

  /**
   * @summary Deletes a direction, its progress, and preference references.
   * @param {string} directionId - The direction ID.
   * @returns {Promise<void>} A promise that resolves after the cascade completes.
   */
  public async deleteDirection(directionId: string): Promise<void> {
    await this.database.transaction(
      'rw',
      this.database.user_deck_preference,
      this.database.direction,
      this.database.card_progress,
      async () => {
        const preferences = await this.database.user_deck_preference
          .where('last_selected_direction_id')
          .equals(directionId)
          .toArray()
        await Promise.all([
          this.database.card_progress.where('direction_id').equals(directionId).delete(),
          this.database.direction.delete(directionId),
          ...preferences.map((preference) =>
            this.database.user_deck_preference.put({
              ...preference,
              last_selected_direction_id: null,
              pending: 0,
              revision: preference.revision + 1,
            }),
          ),
        ])
      },
    )
  }

  /**
   * @summary Deletes a progress row by ID.
   * @param {string} progressId - The local progress ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteProgress(progressId: string): Promise<void> {
    await this.database.card_progress.delete(progressId)
  }

  /**
   * @summary Returns pending progress and settings rows with their revision snapshots.
   * @returns {Promise<PendingChanges>} Pending local writes.
   */
  public async getPendingChanges(): Promise<PendingChanges> {
    const [progress, profiles, preferences] = await Promise.all([
      this.database.card_progress.where('pending').equals(1).toArray(),
      this.database.profile.where('pending').equals(1).toArray(),
      this.database.user_deck_preference.where('pending').equals(1).toArray(),
    ])
    return { progress, profiles, preferences }
  }

  /**
   * @summary Reports whether any local progress or settings rows are pending.
   * @returns {Promise<boolean>} True when pending rows exist.
   */
  public async hasPendingChanges(): Promise<boolean> {
    const changes = await this.getPendingChanges()
    return (
      changes.progress.length > 0 || changes.profiles.length > 0 || changes.preferences.length > 0
    )
  }

  /**
   * @summary Replaces global and one deck's data in a single transaction.
   * @param {SyncUnit} syncUnit - The fully downloaded data to commit.
   * @returns {Promise<void>} A promise that resolves after the atomic replacement.
   */
  public async replaceSyncUnit(syncUnit: SyncUnit): Promise<void> {
    await this.database.transaction(
      'rw',
      [
        this.database.meta,
        this.database.profile,
        this.database.user_deck_preference,
        this.database.deck,
        this.database.card,
        this.database.tag,
        this.database.direction,
        this.database.card_progress,
      ],
      async () => {
        const ownerId = syncUnit.global.profile.id
        const previousDecks = await this.database.deck.toArray()
        const incomingDeckIds = new Set(syncUnit.global.decks.map((deck) => deck.id))
        const removedDeckIds = previousDecks
          .filter((deck) => deck.user_id === ownerId && !incomingDeckIds.has(deck.id))
          .map((deck) => deck.id)
        const currentProfile = await this.database.profile.get(ownerId)
        const currentPreferences = await this.database.user_deck_preference
          .where('user_id')
          .equals(ownerId)
          .toArray()
        const pendingPreferences = new Map(
          currentPreferences.filter((row) => row.pending === 1).map((row) => [row.deck_id, row]),
        )
        const profileRow = this.mergeProfileSettings(syncUnit.global.profile, currentProfile)

        await this.database.meta.put({ key: 'owner', value: ownerId })
        await this.database.profile.put(profileRow)
        await this.database.user_deck_preference
          .where('user_id')
          .equals(ownerId)
          .delete()
        await this.database.user_deck_preference.bulkPut(
          syncUnit.global.preferences.map((preference) => {
            const pending = pendingPreferences.get(preference.deck_id)
            return pending ?? { ...preference, pending: 0, revision: 0 }
          }),
        )
        await this.database.deck.where('user_id').equals(ownerId).delete()
        await this.database.deck.bulkPut(syncUnit.global.decks)
        await this.removeDeckRows(removedDeckIds)
        if (syncUnit.deck) await this.replaceDeckRows(syncUnit.deck)
      },
    )
  }

  /**
   * @summary Reconciles a pushed progress snapshot without overwriting newer local edits.
   * @param {LocalProgressRow} snapshot - The row and revision sent to Supabase.
   * @param {ProgressRow} serverRow - The resulting server row.
   * @returns {Promise<void>} A promise that resolves after reconciliation.
   */
  public async reconcileProgress(
    snapshot: LocalProgressRow,
    serverRow: ProgressRow,
  ): Promise<void> {
    await this.database.transaction('rw', this.database.card_progress, async () => {
      const key: [string, string, string] = [
        snapshot.user_id,
        snapshot.card_id,
        snapshot.direction_id,
      ]
      const current = await this.database.card_progress
        .where('[user_id+card_id+direction_id]')
        .equals(key)
        .first()
      if (!current) return

      await this.database.card_progress.delete(current.id)
      const changedSinceSnapshot = current.revision !== snapshot.revision
      await this.database.card_progress.put({
        ...(changedSinceSnapshot ? current : serverRow),
        id: serverRow.id,
        pending: changedSinceSnapshot ? 1 : 0,
        revision: current.revision + 1,
      })
    })
  }

  /**
   * @summary Reconciles pushed profile settings without overwriting newer local edits.
   * @param {LocalProfileRow} snapshot - The profile settings sent to Supabase.
   * @param {ProfileRow} serverRow - The resulting server profile.
   * @returns {Promise<void>} A promise that resolves after reconciliation.
   */
  public async reconcileProfileSettings(
    snapshot: LocalProfileRow,
    serverRow: ProfileRow,
  ): Promise<void> {
    await this.database.transaction('rw', this.database.profile, async () => {
      const current = await this.database.profile.get(snapshot.id)
      if (!current) return
      const changedSinceSnapshot = current.revision !== snapshot.revision
      await this.database.profile.put({
        ...current,
        ...(changedSinceSnapshot
          ? {}
          : {
              last_active_deck_id: serverRow.last_active_deck_id,
              updated_at: serverRow.updated_at,
            }),
        pending: changedSinceSnapshot ? 1 : 0,
        revision: current.revision + 1,
      })
    })
  }

  /**
   * @summary Clears a settings pending flag only when its revision still matches.
   * @param {SettingsSnapshot} snapshot - The settings row that was pushed.
   * @returns {Promise<void>} A promise that resolves after acknowledgment.
   */
  public async acknowledgeSettings(snapshot: SettingsSnapshot): Promise<void> {
    if ('last_active_deck_id' in snapshot) {
      await this.database.transaction('rw', this.database.profile, async () => {
        const current = await this.database.profile.get(snapshot.id)
        if (current?.revision === snapshot.revision) {
          await this.database.profile.put({ ...current, pending: 0 })
        }
      })
      return
    }

    await this.database.transaction(
      'rw',
      this.database.user_deck_preference,
      async () => {
        const key: [string, string] = [snapshot.user_id, snapshot.deck_id]
        const current = await this.database.user_deck_preference.get(key)
        if (current?.revision === snapshot.revision) {
          await this.database.user_deck_preference.put({ ...current, pending: 0 })
        }
      },
    )
  }

  /**
   * @summary Removes a rejected progress row only if it has not changed since submission.
   * @param {LocalProgressRow} snapshot - The rejected row and revision.
   * @returns {Promise<void>} A promise that resolves after conditional removal.
   */
  public async dropRejectedProgress(snapshot: LocalProgressRow): Promise<void> {
    await this.database.transaction('rw', this.database.card_progress, async () => {
      const current = await this.database.card_progress.get(snapshot.id)
      if (current?.revision === snapshot.revision) {
        await this.database.card_progress.delete(snapshot.id)
      }
    })
  }

  /**
   * @summary Removes a rejected settings row only if it has not changed since submission.
   * @param {SettingsSnapshot} snapshot - The rejected settings and revision.
   * @returns {Promise<void>} A promise that resolves after conditional removal.
   */
  public async dropRejectedSettings(snapshot: SettingsSnapshot): Promise<void> {
    if ('last_active_deck_id' in snapshot) {
      await this.database.transaction('rw', this.database.profile, async () => {
        const current = await this.database.profile.get(snapshot.id)
        if (current?.revision === snapshot.revision) {
          await this.database.profile.put({ ...current, pending: 0 })
        }
      })
      return
    }
    await this.database.transaction(
      'rw',
      this.database.user_deck_preference,
      async () => {
        const key: [string, string] = [snapshot.user_id, snapshot.deck_id]
        const current = await this.database.user_deck_preference.get(key)
        if (current?.revision === snapshot.revision) {
          await this.database.user_deck_preference.put({ ...current, pending: 0 })
        }
      },
    )
  }

  private async clearLastActiveDeck(deckId: string): Promise<void> {
    const profiles = await this.database.profile.where('last_active_deck_id').equals(deckId).toArray()
    await Promise.all(
      profiles.map((profile) =>
        this.database.profile.put({
          ...profile,
          last_active_deck_id: null,
          pending: 0,
          revision: profile.revision + 1,
        }),
      ),
    )
  }

  private async removeDeckRows(deckIds: string[]): Promise<void> {
    if (deckIds.length === 0) return
    const directionIds = await this.database.direction.where('deck_id').anyOf(deckIds).primaryKeys()
    const cardIds = await this.database.card.where('deck_id').anyOf(deckIds).primaryKeys()
    await Promise.all([
      this.database.card_progress.where('direction_id').anyOf(directionIds).delete(),
      this.database.card_progress.where('card_id').anyOf(cardIds).delete(),
      this.database.user_deck_preference.where('deck_id').anyOf(deckIds).delete(),
      this.database.card.where('deck_id').anyOf(deckIds).delete(),
      this.database.tag.where('deck_id').anyOf(deckIds).delete(),
      this.database.direction.where('deck_id').anyOf(deckIds).delete(),
      this.database.deck.bulkDelete(deckIds),
    ])
  }

  private async replaceDeckRows(deck: DeckRow & DeckSyncData): Promise<void> {
    const deckId = deck.id
    const currentDirections = await this.database.direction
      .where('deck_id')
      .equals(deckId)
      .primaryKeys()
    const directionIds = [...new Set([...currentDirections, ...deck.directions.map((row) => row.id)])]
    const pendingProgress = await this.database.card_progress
      .where('direction_id')
      .anyOf(directionIds)
      .filter((row) => row.pending === 1)
      .toArray()
    const pendingProgressKeys = new Set(
      pendingProgress.map((row) => `${row.user_id}:${row.card_id}:${row.direction_id}`),
    )
    const remoteProgress = deck.progress.filter(
      (row) => !pendingProgressKeys.has(`${row.user_id}:${row.card_id}:${row.direction_id}`),
    )
    await Promise.all([
      this.database.card.where('deck_id').equals(deckId).delete(),
      this.database.tag.where('deck_id').equals(deckId).delete(),
      this.database.direction.where('deck_id').equals(deckId).delete(),
      this.database.card_progress
        .where('direction_id')
        .anyOf(directionIds)
        .filter((row) => row.pending === 0)
        .delete(),
    ])
    await Promise.all([
      this.database.card.bulkPut(deck.cards),
      this.database.tag.bulkPut(deck.tags),
      this.database.direction.bulkPut(deck.directions),
      this.database.card_progress.bulkPut(
        remoteProgress.map((row) => ({ ...row, pending: 0, revision: 0 })),
      ),
    ])
  }

  private mergeProfileSettings(
    incoming: ProfileRow,
    current: LocalProfileRow | undefined,
  ): LocalProfileRow {
    if (current?.pending === 1) {
      return {
        ...incoming,
        last_active_deck_id: current.last_active_deck_id,
        pending: 1,
        revision: current.revision,
      }
    }
    return { ...incoming, pending: 0, revision: current?.revision ?? 0 }
  }

  private toProgressRow(row: LocalProgressRow): ProgressRow {
    const { pending: _pending, revision: _revision, ...progress } = row
    return progress
  }
}
