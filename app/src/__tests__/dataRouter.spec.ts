import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataRouter, StartupSyncError, SYNC_DEADLINE_MS } from '@/data/dataRouter'
import { LocalSource } from '@/data/localSource'
import { RemoteSource } from '@/data/remoteSource'
import type {
  DeckRow,
  DeckSyncData,
  GlobalSyncData,
  ProgressRow,
} from '@/data/dataTypes'

const createdAt = '2026-01-01T00:00:00.000Z'
const deck: DeckRow = {
  id: 'deck-1',
  user_id: 'user-1',
  title: 'Deck',
  side_labels: ['Term', 'Meaning'],
  created_at: createdAt,
  updated_at: createdAt,
}
const globalData: GlobalSyncData = {
  profile: {
    id: 'user-1',
    created_at: createdAt,
    updated_at: createdAt,
    last_active_deck_id: 'deck-1',
  },
  preferences: [],
  decks: [deck],
}
const deckData: DeckRow & DeckSyncData = {
  ...deck,
  cards: [],
  tags: [],
  directions: [],
  progress: [],
}

class FakeRemoteSource extends RemoteSource {
  public remoteRows: ProgressRow[] = []
  public upsertedRows: ProgressRow[] = []
  public globalData = globalData
  public deckData = deckData
  public failDeckDownload = false
  public remoteRevocationPending = false
  public lastSignal: AbortSignal | undefined
  public beforeProgressUpsert: (() => Promise<void>) | null = null

  public override async signOut(): Promise<{ remoteRevocationPending: boolean }> {
    return { remoteRevocationPending: this.remoteRevocationPending }
  }

  public override async findProgressForUser(
    _userId: string,
    _cardIds: string[],
    _directionIds: string[],
    _signal?: AbortSignal,
  ): Promise<ProgressRow[]> {
    return this.remoteRows
  }

  public override async upsertProgressBatch(
    rows: ProgressRow[],
    _signal?: AbortSignal,
  ): Promise<ProgressRow[]> {
    this.upsertedRows = rows
    await this.beforeProgressUpsert?.()
    return rows.map((row) => ({ ...row, id: 'server-progress' }))
  }

  public override async downloadGlobalData(
    _userId: string,
    signal?: AbortSignal,
  ): Promise<GlobalSyncData> {
    this.lastSignal = signal
    return this.globalData
  }

  public override async downloadDeckData(
    _deck: DeckRow,
    signal?: AbortSignal,
  ): Promise<DeckRow & DeckSyncData> {
    this.lastSignal = signal
    if (this.failDeckDownload) throw new Error('Deck download failed.')
    return this.deckData
  }
}

const localSource = new LocalSource()

describe('DataRouter', () => {
  beforeEach(async () => {
    await localSource.open()
    await localSource.clear()
    vi.restoreAllMocks()
  })

  it('pushes a newer pending progress row and adopts the server ID', async () => {
    const remoteSource = new FakeRemoteSource()
    const router = new DataRouter(localSource, remoteSource)
    const localRow: ProgressRow = {
      id: '',
      user_id: 'user-1',
      card_id: 'card-1',
      direction_id: 'direction-1',
      counter: 5,
      last_updated: '2026-01-02T00:00:00.000Z',
    }
    await localSource.saveProgress(localRow)

    await router.pushPendingChanges()

    expect(remoteSource.upsertedRows).toHaveLength(1)
    expect(remoteSource.upsertedRows[0]?.counter).toBe(5)
    await expect(
      localSource.findProgressForUserCardAndDirection('user-1', 'card-1', 'direction-1'),
    ).resolves.toMatchObject({ id: 'server-progress', counter: 5 })
    expect(await localSource.hasPendingChanges()).toBe(false)
  })

  it('proxies device sign-out through the remote source without clearing local data', async () => {
    const remoteSource = new FakeRemoteSource()
    remoteSource.remoteRevocationPending = true
    const router = new DataRouter(localSource, remoteSource)
    await localSource.saveProgress({
      id: '',
      user_id: 'user-1',
      card_id: 'card-1',
      direction_id: 'direction-1',
      counter: 3,
      last_updated: createdAt,
    })

    await expect(router.signOut()).resolves.toEqual({ remoteRevocationPending: true })
    await expect(
      localSource.findProgressForUserCardAndDirection('user-1', 'card-1', 'direction-1'),
    ).resolves.toMatchObject({ counter: 3 })
  })

  it('preserves the local mirror for the same user and clears it for a different user', async () => {
    const router = new DataRouter(localSource, new FakeRemoteSource())
    await localSource.setOwnerUserId('user-1')
    await localSource.saveProgress({
      id: '',
      user_id: 'user-1',
      card_id: 'card-1',
      direction_id: 'direction-1',
      counter: 4,
      last_updated: createdAt,
    })

    await router.restoreUser('user-1')
    await expect(
      localSource.findProgressForUserCardAndDirection('user-1', 'card-1', 'direction-1'),
    ).resolves.toMatchObject({ counter: 4 })

    await router.restoreUser('user-2')
    await expect(
      localSource.findProgressForUserCardAndDirection('user-1', 'card-1', 'direction-1'),
    ).resolves.toBeNull()
  })

  it('keeps the newer remote value without pushing an older local snapshot', async () => {
    const remoteSource = new FakeRemoteSource()
    remoteSource.remoteRows = [
      {
        id: 'server-progress',
        user_id: 'user-1',
        card_id: 'card-1',
        direction_id: 'direction-1',
        counter: 8,
        last_updated: '2026-01-03T00:00:00.000Z',
      },
    ]
    const router = new DataRouter(localSource, remoteSource)
    await localSource.saveProgress({
      id: '',
      user_id: 'user-1',
      card_id: 'card-1',
      direction_id: 'direction-1',
      counter: 3,
      last_updated: '2026-01-02T00:00:00.000Z',
    })

    await router.pushPendingChanges()

    expect(remoteSource.upsertedRows).toEqual([])
    await expect(
      localSource.findProgressForUserCardAndDirection('user-1', 'card-1', 'direction-1'),
    ).resolves.toMatchObject({ id: 'server-progress', counter: 8 })
    expect(await localSource.hasPendingChanges()).toBe(false)
  })

  it('keeps a local edit made while a progress push is in flight pending', async () => {
    const remoteSource = new FakeRemoteSource()
    remoteSource.beforeProgressUpsert = async () => {
      await localSource.saveProgress({
        id: '',
        user_id: 'user-1',
        card_id: 'card-1',
        direction_id: 'direction-1',
        counter: 6,
        last_updated: '2026-01-03T00:00:00.000Z',
      })
    }
    const router = new DataRouter(localSource, remoteSource)
    await localSource.saveProgress({
      id: '',
      user_id: 'user-1',
      card_id: 'card-1',
      direction_id: 'direction-1',
      counter: 5,
      last_updated: '2026-01-02T00:00:00.000Z',
    })

    await router.pushPendingChanges()

    await expect(
      localSource.findProgressForUserCardAndDirection('user-1', 'card-1', 'direction-1'),
    ).resolves.toMatchObject({
      id: 'server-progress',
      counter: 6,
      last_updated: '2026-01-03T00:00:00.000Z',
    })
    expect(await localSource.hasPendingChanges()).toBe(true)
  })

  it('commits global data and the active deck after the full download succeeds', async () => {
    const router = new DataRouter(localSource, new FakeRemoteSource())

    await router.syncAtStartup('user-1')

    await expect(localSource.findProfileById('user-1')).resolves.toMatchObject({
      last_active_deck_id: 'deck-1',
    })
    await expect(localSource.findDeckById('deck-1')).resolves.toMatchObject({ title: 'Deck' })
  })

  it('discards an incomplete deck download and retains the existing mirror', async () => {
    const existingDeck = { ...deck, title: 'Existing local deck' }
    await localSource.replaceSyncUnit({
      global: {
        ...globalData,
        profile: { ...globalData.profile, last_active_deck_id: null },
        decks: [existingDeck],
      },
      deck: { ...deckData, ...existingDeck },
    })
    const remoteSource = new FakeRemoteSource()
    remoteSource.failDeckDownload = true
    const router = new DataRouter(localSource, remoteSource)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await router.syncAtStartup('user-1')

    await expect(localSource.findDeckById('deck-1')).resolves.toMatchObject({
      title: 'Existing local deck',
    })
    expect(router.status.value.abandoned).toBe(true)
  })

  it(
    'aborts startup downloads at the shared sync deadline',
    async () => {
    const remoteSource = new FakeRemoteSource()
    remoteSource.downloadGlobalData = (_userId: string, signal?: AbortSignal) => {
      remoteSource.lastSignal = signal
      return new Promise<GlobalSyncData>(() => undefined)
    }
    const router = new DataRouter(localSource, remoteSource)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(router.syncAtStartup('user-1')).rejects.toBeInstanceOf(StartupSyncError)
    expect(remoteSource.lastSignal?.aborted).toBe(true)
    },
    SYNC_DEADLINE_MS + 5000,
  )
})
