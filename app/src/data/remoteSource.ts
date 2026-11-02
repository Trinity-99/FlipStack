import { supabase } from '@/db/supabase'
import { AuthenticationError } from '@/data/authenticationError'
import type {
  CardRow,
  CardRowWithTagIds,
  DeckPreferenceRow,
  DeckRow,
  DeckSyncData,
  DirectionRow,
  GlobalSyncData,
  ProfileRow,
  ProgressRow,
  TagRow,
} from '@/data/dataTypes'
import type { CardContent } from '@/models/card'

const PAGE_SIZE = 1000

interface DatabaseError {
  code?: string
  message: string
  status?: number
}

interface PageResult<T> {
  data: T[] | null
  error: DatabaseError | null
}

interface AuthResult {
  data: {
    user: { id: string } | null
    session: import('@supabase/supabase-js').Session | null
  }
  error: DatabaseError | null
}

interface Credentials {
  email: string
  password: string
}

interface ContentSaveResult<T> {
  data: T | null
  error: DatabaseError | null
}

export interface DeckInput {
  id: string | null
  user_id: string
  title: string
  side_labels: string[]
}

export interface CardInput {
  id: string | null
  deck_id: string
  user_id: string
  content: CardContent
  tag_ids: string[]
}

export interface TagInput {
  id: string | null
  deck_id: string
  name: string
}

export interface DirectionInput {
  id: string | null
  deck_id: string
  configuration: DirectionRow['configuration']
}

/**
 * @summary Encapsulates all Supabase data and authentication operations.
 */
export class RemoteSource {
  /**
   * @summary Signs in a user through Supabase Auth.
   * @param {Credentials} credentials - The validated sign-in credentials.
   * @returns {Promise<AuthResult>} The Supabase authentication result.
   * @throws {AuthenticationError} If Supabase rejects or cannot complete authentication.
   */
  public async signInWithPassword(credentials: Credentials): Promise<AuthResult> {
    try {
      const result = await supabase.auth.signInWithPassword(credentials)
      if (result.error) {
        const kind = this.isInvalidCredentials(result.error)
          ? 'invalid-credentials'
          : this.isNetworkError(result.error)
            ? 'network'
            : 'unexpected'
        const message =
          kind === 'network'
            ? 'Unable to connect to the authentication service.'
            : 'Supabase authentication was rejected.'
        throw new AuthenticationError(kind, message, result.error)
      }
      return result
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) throw error
      const kind = this.isNetworkError(error) ? 'network' : 'unexpected'
      throw new AuthenticationError(
        kind,
        kind === 'network'
          ? 'Unable to connect to the authentication service.'
          : 'Supabase authentication failed.',
        error,
      )
    }
  }

  /**
   * @summary Restores the persisted Supabase session.
   * @returns {Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>>} The current session result.
   */
  public async getSession(): Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>> {
    return this.run('RemoteSource.getSession', () => supabase.auth.getSession())
  }

  /**
   * @summary Saves a deck remotely and returns its server row.
   * @param {DeckInput} row - The validated deck data.
   * @returns {Promise<DeckRow>} The saved server row.
   */
  public async saveDeck(row: DeckInput): Promise<DeckRow> {
    return this.saveRow<DeckRow>('deck', row.id, {
      user_id: row.user_id,
      title: row.title,
      side_labels: row.side_labels,
    })
  }

  /**
   * @summary Saves a card and replaces its tag links remotely.
   * @param {CardInput} row - The validated card and tag IDs.
   * @returns {Promise<CardRowWithTagIds>} The saved card with its tag IDs.
   */
  public async saveCard(row: CardInput): Promise<CardRowWithTagIds> {
    const savedCard = await this.saveRow<CardRow>('card', row.id, {
      deck_id: row.deck_id,
      user_id: row.user_id,
      content: row.content,
    })
    try {
      await this.run('RemoteSource.saveCard.deleteTagLinks', async () => {
        const { error } = await supabase.from('card_tag').delete().eq('card_id', savedCard.id)
        if (error) throw error
      })
    } catch (error: unknown) {
      const message = this.isError(error) ? error.message : 'Unknown database error.'
      throw new Error(`Failed to clear old card tags: ${message}`)
    }
    if (row.tag_ids.length > 0) {
      try {
        await this.run('RemoteSource.saveCard.insertTagLinks', async () => {
          const { error } = await supabase.from('card_tag').insert(
            row.tag_ids.map((tagId) => ({ card_id: savedCard.id, tag_id: tagId })),
          )
          if (error) throw error
        })
      } catch (error: unknown) {
        const message = this.isError(error) ? error.message : 'Unknown database error.'
        throw new Error(`Failed to save card tags: ${message}`)
      }
    }
    return { ...savedCard, tag_ids: [...row.tag_ids] }
  }

  /**
   * @summary Saves a tag remotely and returns its server row.
   * @param {TagInput} row - The validated tag.
   * @returns {Promise<TagRow>} The saved server row.
   */
  public async saveTag(row: TagInput): Promise<TagRow> {
    return this.saveRow<TagRow>('tag', row.id, { deck_id: row.deck_id, name: row.name })
  }

  /**
   * @summary Saves a direction remotely and returns its server row.
   * @param {DirectionInput} row - The validated direction.
   * @returns {Promise<DirectionRow>} The saved server row.
   */
  public async saveDirection(row: DirectionInput): Promise<DirectionRow> {
    return this.saveRow<DirectionRow>('direction', row.id, {
      deck_id: row.deck_id,
      configuration: row.configuration,
    })
  }

  /**
   * @summary Deletes a deck remotely.
   * @param {string} id - The deck ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteDeck(id: string): Promise<void> {
    await this.deleteRow('deck', id)
  }

  /**
   * @summary Deletes a card remotely.
   * @param {string} id - The card ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteCard(id: string): Promise<void> {
    await this.deleteRow('card', id)
  }

  /**
   * @summary Deletes a tag remotely.
   * @param {string} id - The tag ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteTag(id: string): Promise<void> {
    await this.deleteRow('tag', id)
  }

  /**
   * @summary Deletes a direction remotely.
   * @param {string} id - The direction ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteDirection(id: string): Promise<void> {
    await this.deleteRow('direction', id)
  }

  /**
   * @summary Deletes a progress row remotely by its server ID.
   * @param {string} id - The progress ID.
   * @returns {Promise<void>} A promise that resolves after deletion.
   */
  public async deleteProgress(id: string): Promise<void> {
    await this.run('RemoteSource.deleteProgress', async () => {
      const { error } = await supabase.from('card_progress').delete().eq('id', id)
      if (error) throw error
    })
  }

  /**
   * @summary Updates a profile's active deck remotely.
   * @param {ProfileRow} row - The profile settings to persist.
   * @returns {Promise<ProfileRow>} The updated server profile.
   */
  public async updateProfileSettings(row: ProfileRow): Promise<ProfileRow> {
    return this.run('RemoteSource.updateProfileSettings', async () => {
      const { data, error } = await supabase
        .from('profile')
        .update({
          last_active_deck_id: row.last_active_deck_id,
          updated_at: row.updated_at,
        })
        .eq('id', row.id)
        .select('*')
        .single()
      if (error || !data) throw error ?? new Error('No profile row returned after update.')
      return data as ProfileRow
    })
  }

  /**
   * @summary Upserts per-deck preferences remotely.
   * @param {DeckPreferenceRow[]} rows - Preference rows to persist.
   * @returns {Promise<void>} A promise that resolves after the upsert.
   */
  public async upsertDeckPreferences(rows: DeckPreferenceRow[]): Promise<void> {
    if (rows.length === 0) return
    await this.run('RemoteSource.upsertDeckPreferences', async () => {
      const { error } = await supabase.from('user_deck_preference').upsert(
        rows.map((row) => ({
          user_id: row.user_id,
          deck_id: row.deck_id,
          last_selected_direction_id: row.last_selected_direction_id,
          last_selected_tag_id: row.last_selected_tag_id,
          updated_at: row.updated_at,
        })),
        { onConflict: 'user_id,deck_id' },
      )
      if (error) throw error
    })
  }

  /**
   * @summary Fetches remote progress for the supplied cards and directions.
   * @param {string} userId - The authenticated user ID.
   * @param {string[]} cardIds - Card IDs to check.
   * @param {string[]} directionIds - Direction IDs to check.
   * @param {AbortSignal} [signal] - Optional cancellation signal.
   * @returns {Promise<ProgressRow[]>} Matching remote progress rows.
   */
  public async findProgressForUser(
    userId: string,
    cardIds: string[],
    directionIds: string[],
    signal?: AbortSignal,
  ): Promise<ProgressRow[]> {
    if (cardIds.length === 0 || directionIds.length === 0) return []
    return this.run('RemoteSource.findProgressForUser', async () => {
      const rows: ProgressRow[] = []
      for (const cardChunk of this.chunks(cardIds)) {
        for (const directionChunk of this.chunks(directionIds)) {
          rows.push(
            ...(await this.fetchAllPages<ProgressRow>((from, to) => {
              let query = supabase
                .from('card_progress')
                .select('*')
                .eq('user_id', userId)
                .in('card_id', cardChunk)
                .in('direction_id', directionChunk)
                .range(from, to)
              if (signal) query = query.abortSignal(signal)
              return query
            })),
          )
        }
      }
      return rows
    })
  }

  /**
   * @summary Upserts progress with the existing user/card/direction conflict key.
   * @param {ProgressRow[]} rows - Progress to send.
   * @param {AbortSignal} [signal] - Optional cancellation signal.
   * @returns {Promise<ProgressRow[]>} Server rows returned by Supabase.
   */
  public async upsertProgressBatch(
    rows: ProgressRow[],
    signal?: AbortSignal,
  ): Promise<ProgressRow[]> {
    if (rows.length === 0) return []
    return this.run('RemoteSource.upsertProgressBatch', async () => {
      let query = supabase
        .from('card_progress')
        .upsert(
          rows.map((row) => ({
            user_id: row.user_id,
            card_id: row.card_id,
            direction_id: row.direction_id,
            counter: row.counter,
            last_updated: row.last_updated,
          })),
          { onConflict: 'user_id,card_id,direction_id' },
        )
        .select('*')
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      if (error || !data) throw error ?? new Error('No progress rows returned after upsert.')
      return data as ProgressRow[]
    })
  }

  /**
   * @summary Downloads a user's profile, preferences, and complete deck list.
   * @param {string} userId - The authenticated user ID.
   * @param {AbortSignal} [signal] - Optional cancellation signal.
   * @returns {Promise<GlobalSyncData>} Complete global sync data.
   */
  public async downloadGlobalData(userId: string, signal?: AbortSignal): Promise<GlobalSyncData> {
    return this.run('RemoteSource.downloadGlobalData', async () => {
      let profileQuery = supabase.from('profile').select('*').eq('id', userId)
      if (signal) profileQuery = profileQuery.abortSignal(signal)
      const { data: profile, error: profileError } = await profileQuery.single()
      if (profileError || !profile) throw profileError ?? new Error('Profile row is missing.')

      const [preferences, decks] = await Promise.all([
        this.fetchAllPages<DeckPreferenceRow>((from, to) => {
          let query = supabase
            .from('user_deck_preference')
            .select('*')
            .eq('user_id', userId)
            .range(from, to)
          if (signal) query = query.abortSignal(signal)
          return query
        }),
        this.fetchAllPages<DeckRow>((from, to) => {
          let query = supabase
            .from('deck')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(from, to)
          if (signal) query = query.abortSignal(signal)
          return query
        }),
      ])
      return { profile: profile as ProfileRow, preferences, decks }
    })
  }

  /**
   * @summary Downloads all content and progress belonging to a deck.
   * @param {DeckRow} deck - The deck to download.
   * @param {AbortSignal} [signal] - Optional cancellation signal.
   * @returns {Promise<DeckRow & DeckSyncData>} Complete deck sync data.
   */
  public async downloadDeckData(
    deck: DeckRow,
    signal?: AbortSignal,
  ): Promise<DeckRow & DeckSyncData> {
    return this.run(`RemoteSource.downloadDeckData:${deck.id}`, async () => {
      const [cards, tags, directions] = await Promise.all([
        this.fetchAllPages<CardRow>((from, to) => {
          let query = supabase
            .from('card')
            .select('*')
            .eq('deck_id', deck.id)
            .order('created_at', { ascending: false })
            .range(from, to)
          if (signal) query = query.abortSignal(signal)
          return query
        }),
        this.fetchAllPages<TagRow>((from, to) => {
          let query = supabase
            .from('tag')
            .select('*')
            .eq('deck_id', deck.id)
            .order('name', { ascending: true })
            .range(from, to)
          if (signal) query = query.abortSignal(signal)
          return query
        }),
        this.fetchAllPages<DirectionRow>((from, to) => {
          let query = supabase
            .from('direction')
            .select('*')
            .eq('deck_id', deck.id)
            .order('created_at', { ascending: true })
            .range(from, to)
          if (signal) query = query.abortSignal(signal)
          return query
        }),
      ])

      const relations = await this.downloadCardTagRelations(
        cards.map((card) => card.id),
        signal,
      )
      const tagIdsByCard = new Map<string, string[]>()
      for (const relation of relations) {
        const tagIds = tagIdsByCard.get(relation.card_id) ?? []
        tagIds.push(relation.tag_id)
        tagIdsByCard.set(relation.card_id, tagIds)
      }
      const cardsWithTags = cards.map((card) => ({
        ...card,
        tag_ids: tagIdsByCard.get(card.id) ?? [],
      }))
      const progress = await this.downloadProgressForDirections(
        deck.user_id,
        directions.map((direction) => direction.id),
        signal,
      )
      return { ...deck, cards: cardsWithTags, tags, directions, progress }
    })
  }

  private async downloadCardTagRelations(
    cardIds: string[],
    signal?: AbortSignal,
  ): Promise<Array<{ card_id: string; tag_id: string }>> {
    const relations: Array<{ card_id: string; tag_id: string }> = []
    for (const chunk of this.chunks(cardIds)) {
      relations.push(
        ...(await this.fetchAllPages<{ card_id: string; tag_id: string }>((from, to) => {
          let query = supabase
            .from('card_tag')
            .select('card_id, tag_id')
            .in('card_id', chunk)
            .range(from, to)
          if (signal) query = query.abortSignal(signal)
          return query
        })),
      )
    }
    return relations
  }

  private async downloadProgressForDirections(
    userId: string,
    directionIds: string[],
    signal?: AbortSignal,
  ): Promise<ProgressRow[]> {
    const rows: ProgressRow[] = []
    for (const chunk of this.chunks(directionIds)) {
      rows.push(
        ...(await this.fetchAllPages<ProgressRow>((from, to) => {
          let query = supabase
            .from('card_progress')
            .select('*')
            .eq('user_id', userId)
            .in('direction_id', chunk)
            .range(from, to)
          if (signal) query = query.abortSignal(signal)
          return query
        })),
      )
    }
    return rows
  }

  private async saveRow<T>(
    table: 'deck' | 'card' | 'tag' | 'direction',
    id: string | null,
    row: Record<string, unknown>,
  ): Promise<T> {
    return this.run(`RemoteSource.save:${table}`, async () => {
      const query = supabase.from(table)
      const result = id
        ? await query.update(row).eq('id', id).select('*').single()
        : await query.insert(row).select('*').single()
      const { data, error } = result as ContentSaveResult<T>
      if (error || !data) throw error ?? new Error(`No ${table} row returned after save.`)
      return data
    })
  }

  private async deleteRow(table: 'deck' | 'card' | 'tag' | 'direction', id: string): Promise<void> {
    await this.run(`RemoteSource.delete:${table}`, async () => {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
    })
  }

  private async fetchAllPages<T>(
    loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  ): Promise<T[]> {
    const rows: T[] = []
    let from = 0
    while (true) {
      const { data, error } = await loadPage(from, from + PAGE_SIZE - 1)
      if (error) throw error
      if (!data) throw new Error(`Supabase returned no page at offset ${from}.`)
      rows.push(...data)
      if (data.length < PAGE_SIZE) return rows
      from += PAGE_SIZE
    }
  }

  private chunks<T>(values: T[]): T[][] {
    const chunks: T[][] = []
    for (let index = 0; index < values.length; index += PAGE_SIZE) {
      chunks.push(values.slice(index, index + PAGE_SIZE))
    }
    return chunks
  }

  private async run<T>(context: string, operation: () => PromiseLike<T>): Promise<T> {
    try {
      return await operation()
    } catch (error: unknown) {
      console.error(`${context} failed:`, error)
      throw error
    }
  }

  private isInvalidCredentials(error: unknown): boolean {
    return this.isError(error) && (error.code === 'invalid_credentials' || error.status === 401)
  }

  private isNetworkError(error: unknown): boolean {
    return (
      error instanceof TypeError ||
      (error instanceof Error &&
        ['AuthRetryableFetchError', 'FetchError'].includes(error.name))
    )
  }

  private isError(error: unknown): error is DatabaseError {
    return typeof error === 'object' && error !== null && 'message' in error
  }
}
