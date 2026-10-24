import {
  errorMessage,
  isDatabaseRecord,
  optionalDate,
  optionalString,
  requiredString,
} from '@/models/modelUtils'
import { supabase } from '@/db/supabase'
import type { Session } from '@supabase/supabase-js'

export type AuthenticationFailureKind = 'invalid-credentials' | 'network' | 'unexpected'

/**
 * @summary Represents a categorized failure during email and password authentication.
 * @param {AuthenticationFailureKind} kind - The category of authentication failure.
 * @param {string} message - A safe description of the failure.
 * @param {unknown} originalError - The original failure, when available.
 */
export class AuthenticationError extends Error {
  constructor(
    public readonly kind: AuthenticationFailureKind,
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

/**
 * @summary Contains the authenticated user's profile and Supabase session.
 */
export interface AuthenticationResult {
  readonly profile: Profile
  readonly session: Session
}

/**
 * @summary Represents study direction and tag preferences for a specific deck.
 */
export interface DeckPreference {
  readonly deckId: string
  readonly lastSelectedDirectionId: string | null
  readonly lastSelectedTagId: string | null
}

function isErrorRecord(error: unknown): error is Record<string, unknown> {
  return typeof error === 'object' && error !== null
}

function isInvalidCredentialsError(error: unknown): boolean {
  if (!isErrorRecord(error)) return false
  return error.code === 'invalid_credentials' || error.status === 401
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof Error) {
    return error.name === 'AuthRetryableFetchError' || error.name === 'FetchError'
  }
  return false
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
    const { error } = await supabase.from('user_deck_preference').upsert(
      {
        user_id: this.id,
        deck_id: pref.deckId,
        last_selected_direction_id: pref.lastSelectedDirectionId,
        last_selected_tag_id: pref.lastSelectedTagId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,deck_id' },
    )

    if (error) {
      throw new Error(`Failed to save deck preference to database: ${error.message}`)
    }

    return this.withDeckPreference(pref)
  }

  /**
   * @summary Persists the profile's global settings (e.g., `last_active_deck_id`) to Supabase.
   */
  public async saveLastActiveDeck(deckId: string | null): Promise<Profile> {
    const { error } = await supabase
      .from('profile')
      .update({
        last_active_deck_id: deckId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.id)

    if (error) {
      throw new Error(`Failed to update last active deck in database: ${error.message}`)
    }

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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        const kind = isInvalidCredentialsError(error)
          ? 'invalid-credentials'
          : isNetworkError(error)
            ? 'network'
            : 'unexpected'
        const message =
          kind === 'network'
            ? 'Unable to connect to the authentication service.'
            : 'Supabase authentication was rejected.'
        throw new AuthenticationError(kind, message, error)
      }

      if (!data.user || !data.session) {
        throw new Error('Supabase authentication returned no user or session.')
      }

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

      const kind = isInvalidCredentialsError(error)
        ? 'invalid-credentials'
        : isNetworkError(error)
          ? 'network'
          : 'unexpected'
      const message =
        kind === 'network'
          ? 'Unable to connect to the authentication service.'
          : kind === 'invalid-credentials'
            ? 'Invalid login credentials.'
            : `Authentication failed: ${errorMessage(error)}`

      throw new AuthenticationError(kind, message, error)
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
      const { data, error } = await supabase
        .from('profile')
        .select('*, user_deck_preferences:user_deck_preference(*)')
        .eq('id', profileId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null
        throw new Error(`Database error while finding profile by ID: ${error.message}`)
      }

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
