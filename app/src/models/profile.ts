import { errorMessage, isDatabaseRecord, optionalDate, optionalString, requiredString } from '@/models/modelUtils'
import { supabase } from '@/db/supabase'

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
    public readonly deckPreferences: ReadonlyMap<string, DeckPreference> = new Map()
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

    return new Profile(
      this.id,
      this.createdAt,
      new Date(),
      this.lastActiveDeckId,
      updatedMap
    )
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
    const { error } = await supabase
      .from('user_deck_preference')
      .upsert(
        {
          user_id: this.id,
          deck_id: pref.deckId,
          last_selected_direction_id: pref.lastSelectedDirectionId,
          last_selected_tag_id: pref.lastSelectedTagId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,deck_id' }
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

    return new Profile(
      this.id,
      this.createdAt,
      new Date(),
      deckId,
      this.deckPreferences
    )
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
              lastSelectedDirectionId: optionalString(item, 'last_selected_direction_id', 'DeckPreference') ?? null,
              lastSelectedTagId: optionalString(item, 'last_selected_tag_id', 'DeckPreference') ?? null,
            })
          }
        }
      }

      return new Profile(
        requiredString(json, 'id', 'Profile'),
        createdAt,
        updatedAt,
        optionalString(json, 'last_active_deck_id', 'Profile') ?? null,
        preferencesMap
      )
    } catch (error: unknown) {
      throw new Error(`Failed to parse Profile from JSON: ${errorMessage(error)}`)
    }
  }
}