import {
  errorMessage,
  isDatabaseRecord,
  optionalDate,
  optionalString,
  requiredString,
} from '@/models/modelUtils'
import { AuthenticationError } from '@/data/authenticationError'
import { OfflineError, StartupSyncError, dataRouter } from '@/data/dataRouter'
import type { DeckPreferenceRow, ProfileRow } from '@/data/dataTypes'
export { AuthenticationError } from '@/data/authenticationError'
export type { AuthenticationFailureKind } from '@/data/authenticationError'
import type { Session } from '@supabase/supabase-js'

/**
 * @summary Represents a categorized failure during email and password authentication.
 * @param {AuthenticationFailureKind} kind - The category of authentication failure.
 * @param {string} message - A safe description of the failure.
 * @param {unknown} originalError - The original failure, when available.
 */
/**
 * @summary Contains the authenticated user's profile and Supabase session.
 */
export interface AuthenticationResult {
  readonly profile: Profile
  readonly session: Session | null
}

/**
 * @summary Represents study direction and tag preferences for a specific deck.
 */
export interface DeckPreference {
  readonly deckId: string
  readonly lastSelectedDirectionId: string | null
  readonly lastSelectedTagId: string | null
}

/**
 * @summary Represents a user profile mapped to Supabase Auth and User Preferences.
 */
export class Profile {
  constructor(
    public readonly id: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly lastActiveDeckId: string | null = null,
    public readonly deckPreferences: ReadonlyMap<string, DeckPreference> = new Map(),
  ) {}

  /**
   * @summary Retrieves study preferences for a specific deck, returning defaults if non-existent.
   */
  public getDeckPreference(deckId: string): DeckPreference {
    return (
      this.deckPreferences.get(deckId) ?? {
        deckId,
        lastSelectedDirectionId: null,
        lastSelectedTagId: null,
      }
    )
  }

  /**
   * @summary Returns a new Profile instance with updated preference for a given deck in local memory.
   */
  private withDeckPreference(pref: DeckPreference): Profile {
    const updatedMap = new Map(this.deckPreferences)
    updatedMap.set(pref.deckId, pref)

    return new Profile(this.id, this.createdAt, new Date(), this.lastActiveDeckId, updatedMap)
  }

  /**
   * @summary Persists a deck preference update to Supabase (`user_deck_preference` table).
   *
   * Note on persistence strategy: Unlike standard Active Record `.save()` instance methods
   * that check for an existing `id` primary key on a record, `user_deck_preference` uses a
   * composite primary key (`(user_id, deck_id)`).
   *
   * Upsert logic:
   * - If a record matching `(user_id, deck_id)` already exists, Supabase UPDATES it.
   * - If no match exists for `(user_id, deck_id)`, Supabase INSERTS a new record.
   *
   * @param pref The `DeckPreference` object containing `deckId`, `lastSelectedDirectionId`, and `lastSelectedTagId`.
   * @returns An updated immutable `Profile` instance with the saved preference in memory.
   */
  public async saveDeckPreference(pref: DeckPreference): Promise<Profile> {
    const row: DeckPreferenceRow = {
      user_id: this.id,
      deck_id: pref.deckId,
      last_selected_direction_id: pref.lastSelectedDirectionId,
      last_selected_tag_id: pref.lastSelectedTagId,
      updated_at: new Date().toISOString(),
    }
    await dataRouter.saveDeckPreference(row)
    return this.withDeckPreference(pref)
  }

  /**
   * @summary Persists the profile's global settings (e.g., `last_active_deck_id`) to Supabase.
   */
  public async saveLastActiveDeck(deckId: string | null): Promise<Profile> {
    const row: ProfileRow = {
      id: this.id,
      created_at: this.createdAt.toISOString(),
      updated_at: new Date().toISOString(),
      last_active_deck_id: deckId,
    }
    await dataRouter.saveProfileSettings(row)
    return new Profile(this.id, this.createdAt, new Date(), deckId, this.deckPreferences)
  }

  /**
   * @summary Authenticates a user and loads their database-backed profile.
   * @param {string} email - The user's email address.
   * @param {string} password - The user's password.
   * @returns {Promise<AuthenticationResult>} The authenticated profile and session.
   * @throws {AuthenticationError} If credentials, network access, or profile loading fails.
   */
  public static async authenticate(email: string, password: string): Promise<AuthenticationResult> {
    if (!email.trim() || !password) {
      throw new Error('Email and password are required to authenticate.')
    }

    try {
      const { data, error } = await dataRouter.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        throw new AuthenticationError('unexpected', 'Supabase authentication was rejected.', error)
      }

      if (!data.user || !data.session) {
        throw new Error('Supabase authentication returned no user or session.')
      }

      await dataRouter.prepareAuthenticatedUser(data.user.id)
      const profile = await Profile.findById(data.user.id)
      if (!profile) {
        throw new Error(`No profile found for authenticated user ${data.user.id}.`)
      }

      return { profile, session: data.session }
    } catch (error: unknown) {
      console.error('Profile.authenticate failed:', error)

      if (error instanceof AuthenticationError) {
        throw error
      }

      if (error instanceof StartupSyncError || error instanceof OfflineError) throw error
      throw new AuthenticationError(
        'unexpected',
        `Authentication failed: ${errorMessage(error)}`,
        error,
      )
    }
  }

  /**
   * @summary Restores the current authenticated profile from the persisted Supabase session.
   * @returns {Promise<AuthenticationResult | null>} The restored authentication or null when signed out.
   * @throws {Error} If the session or its profile cannot be loaded.
   */
  public static async restoreAuthentication(): Promise<AuthenticationResult | null> {
    try {
      const { data, error } = await dataRouter.getSession()
      if (error) {
        const isNetworkFailure =
          error instanceof TypeError ||
          (error instanceof Error &&
            ['AuthRetryableFetchError', 'FetchError'].includes(error.name))
        const ownerId = await dataRouter.getLocalOwnerUserId()
        const localProfile = ownerId ? await Profile.findById(ownerId) : null
        if (isNetworkFailure && localProfile) {
          return { profile: localProfile, session: null }
        }
        if (isNetworkFailure) throw new StartupSyncError()
        throw new AuthenticationError(
          'unexpected',
          `Failed to restore the authentication session: ${error.message}`,
          error,
        )
      }
      if (!data.session) return null

      await dataRouter.prepareAuthenticatedUser(data.session.user.id)
      const profile = await Profile.findById(data.session.user.id)
      if (!profile) {
        throw new Error(`No profile found for authenticated user ${data.session.user.id}.`)
      }

      return { profile, session: data.session }
    } catch (error: unknown) {
      console.error('Profile.restoreAuthentication failed:', error)
      throw error
    }
  }

  /**
   * @summary Finds a profile by its authenticated user's identifier.
   * @param {string} profileId - The UUID of the profile to find.
   * @returns {Promise<Profile | null>} The matching profile or null when it does not exist.
   * @throws {Error} If the identifier is invalid or the database query fails.
   */
  public static async findById(profileId: string): Promise<Profile | null> {
    if (!profileId || profileId.trim() === '') {
      throw new Error('Invalid profileId provided to Profile.findById.')
    }

    try {
      const data = await dataRouter.findProfileById(profileId)
      return data ? Profile.fromJSON(data) : null
    } catch (error: unknown) {
      console.error(`Profile.findById failed for ID ${profileId}:`, error)
      throw error
    }
  }

  /**
   * @summary Creates a Profile instance from a raw database record.
   * @param json Raw database object or joined record from Supabase.
   * @returns Instantiated Profile object.
   */
  public static fromJSON(json: unknown): Profile {
    if (!isDatabaseRecord(json)) {
      throw new Error('Invalid raw data: Cannot parse Profile from a non-object value.')
    }
    try {
      const createdAt = optionalDate(json, 'created_at', 'Profile')
      const updatedAt = optionalDate(json, 'updated_at', 'Profile')
      if (!createdAt || !updatedAt) {
        throw new Error('Invalid raw data: Missing required timestamps to parse Profile.')
      }

      // Parse nested or array per-deck preferences if included in joined payload
      const preferencesMap = new Map<string, DeckPreference>()
      if (Array.isArray(json.user_deck_preferences)) {
        for (const item of json.user_deck_preferences) {
          if (isDatabaseRecord(item)) {
            const deckId = requiredString(item, 'deck_id', 'DeckPreference')
            preferencesMap.set(deckId, {
              deckId,
              lastSelectedDirectionId:
                optionalString(item, 'last_selected_direction_id', 'DeckPreference') ?? null,
              lastSelectedTagId:
                optionalString(item, 'last_selected_tag_id', 'DeckPreference') ?? null,
            })
          }
        }
      }

      return new Profile(
        requiredString(json, 'id', 'Profile'),
        createdAt,
        updatedAt,
        optionalString(json, 'last_active_deck_id', 'Profile') ?? null,
        preferencesMap,
      )
    } catch (error: unknown) {
      throw new Error(`Failed to parse Profile from JSON: ${errorMessage(error)}`)
    }
  }
}
