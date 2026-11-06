import { dataRouter } from '@/data/dataRouter'
import type { AudioLanguages, DeckSideKey } from '@/data/dataTypes'
import {
  databaseCharacterLength,
  errorMessage,
  isDatabaseRecord,
  requiredDate,
  requiredString,
} from '@/models/modelUtils'

export type DeckSide = 1 | 2 | 3

/**
 * @summary Determines whether a value is a valid BCP 47 language tag.
 * @param {unknown} value - The language tag to validate.
 * @returns {value is string} True when the value contains one valid language tag.
 */
function assertLanguageCode(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error('Audio language code must be a non-empty BCP 47 language tag.')
  }

  try {
    Intl.getCanonicalLocales(value)
  } catch {
    throw new Error(`Invalid audio language code: ${value}.`)
  }
}

/**
 * @summary Represents a study deck containing user-defined side labels and active record persistence.
 */
export class Deck {
  private static readonly MAX_TITLE_LENGTH = 24
  private static readonly MAX_DATABASE_TITLE_LENGTH = 32
  private static readonly MAX_SIDE_LABEL_LENGTH = 32

  constructor(
    public readonly id: string | null,
    public readonly userId: string,
    public title: string,
    public sideLabels: string[],
    public readonly createdAt: Date | null,
    public readonly updatedAt: Date | null,
    public audioLanguages: AudioLanguages = {},
  ) {}

  /**
   * @summary Retrieves the human-readable label for a specific side number.
   * @param {number} sideNum - The side number to query (must be 1, 2, or 3).
   * @returns {string} The custom label for the side, or a fallback name.
   * @throws {Error} If the side number is out of bounds.
   */
  public getSideLabel(sideNum: number): string {
    if (!Number.isInteger(sideNum) || sideNum < 1 || sideNum > 3) {
      throw new Error(`Invalid side number: ${sideNum}. Side numbers must be between 1 and 3.`)
    }
    return this.sideLabels[sideNum - 1] || `Side ${sideNum}`
  }

  /**
   * @summary Gets the configured audio language for a side.
   * @param {DeckSide} side - The one-based side number.
   * @returns {string | null} The language code, or null when audio is disabled.
   * @throws {Error} If the side does not exist in this deck.
   */
  public getAudioLanguage(side: DeckSide): string | null {
    this.validateSide(side)
    return this.audioLanguages[`s${side}` as DeckSideKey] ?? null
  }

  /**
   * @summary Enables audio for a side with the supplied language code.
   * @param {DeckSide} side - The one-based side number.
   * @param {string} languageCode - The BCP 47 language code.
   * @returns {void}
   * @throws {Error} If the side or language code is invalid.
   */
  public setAudioLanguage(side: DeckSide, languageCode: string): void {
    this.validateSide(side)
    assertLanguageCode(languageCode)

    this.audioLanguages = { ...this.audioLanguages, [`s${side}`]: languageCode }
  }

  /**
   * @summary Disables audio for a side.
   * @param {DeckSide} side - The one-based side number.
   * @returns {void}
   * @throws {Error} If the side does not exist in this deck.
   */
  public clearAudioLanguage(side: DeckSide): void {
    this.validateSide(side)
    const sideKey: DeckSideKey = `s${side}`
    const { [sideKey]: _removed, ...audioLanguages } = this.audioLanguages
    this.audioLanguages = audioLanguages
  }

  /**
   * @summary Persists the deck to the database. Inserts a new record if ID is null, otherwise updates the existing record.
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   * @throws {Error} If deck fields are invalid or the database operation fails.
   */
  public async save(): Promise<void> {
    this.validate()
    this.title = this.title.trim()
    this.sideLabels = this.sideLabels.map((label) => label.trim())

    try {
      const saved = await dataRouter.saveDeck({
        id: this.id,
        user_id: this.userId,
        title: this.title,
        side_labels: this.sideLabels,
        audio_languages: this.audioLanguages,
      })
      Object.assign(this, {
        id: saved.id,
        createdAt: new Date(saved.created_at),
        updatedAt: new Date(saved.updated_at),
      })
    } catch (error: unknown) {
      console.error('Deck.save failed:', error)
      throw error
    }
  }

  /**
   * @summary Validates the deck data before it is persisted.
   * @returns {void}
   * @throws {Error} If the user, title, or side labels violate deck requirements.
   */
  private validate(): void {
    if (typeof this.userId !== 'string' || !this.userId.trim()) {
      throw new Error('Cannot save Deck: Missing required userId.')
    }
    if (typeof this.title !== 'string' || !this.title.trim()) {
      throw new Error('Deck name is required.')
    }
    if (this.title.trim().length > Deck.MAX_TITLE_LENGTH) {
      throw new Error('Deck name cannot exceed 24 characters')
    }
    if (
      !Array.isArray(this.sideLabels) ||
      (this.sideLabels.length !== 2 && this.sideLabels.length !== 3)
    ) {
      throw new Error('A deck must have exactly two or three side labels.')
    }
    if (this.sideLabels.some((label) => typeof label !== 'string' || !label.trim())) {
      throw new Error('All deck side labels are required.')
    }
    if (
      this.sideLabels.some(
        (label) => databaseCharacterLength(label.trim()) > Deck.MAX_SIDE_LABEL_LENGTH,
      )
    ) {
      throw new Error(`Deck side labels cannot exceed ${Deck.MAX_SIDE_LABEL_LENGTH} characters.`)
    }
    if (
      !this.audioLanguages ||
      typeof this.audioLanguages !== 'object' ||
      Array.isArray(this.audioLanguages)
    ) {
      throw new Error('Deck audio languages must be an object.')
    }
    for (const [sideKey, languageCode] of Object.entries(this.audioLanguages)) {
      if (!['s1', 's2', 's3'].includes(sideKey)) {
        throw new Error(`Invalid deck audio side: ${sideKey}.`)
      }
      const side = Number(sideKey.slice(1))
      if (side > this.sideLabels.length) {
        throw new Error(`Cannot configure audio for missing side ${side}.`)
      }
      assertLanguageCode(languageCode)
    }
  }

  /**
   * @summary Ensures a side number exists on this deck.
   * @param {DeckSide} side - The one-based side number.
   * @returns {void}
   * @throws {Error} If the side number is invalid or absent.
   */
  private validateSide(side: DeckSide): void {
    if (!Number.isInteger(side) || side < 1 || side > this.sideLabels.length) {
      throw new Error(`Invalid side number: ${side}. This deck does not contain that side.`)
    }
  }

  /**
   * @summary Deletes this deck from the database.
   * @returns {Promise<void>} A promise that resolves when deletion is complete.
   * @throws {Error} If the deck has no ID or the deletion fails.
   */
  public async delete(): Promise<void> {
    if (!this.id) {
      throw new Error('Cannot delete a deck that has not been saved to the database.')
    }

    try {
      await dataRouter.deleteDeck(this.id)
    } catch (error: unknown) {
      console.error(`Deck.delete failed for ID ${this.id}:`, error)
      throw error
    }
  }

  /**
   * @summary Finds a single deck by its unique identifier.
   * @param {string} deckId - The UUID of the deck to find.
   * @returns {Promise<Deck | null>} A promise resolving to the Deck instance, or null if not found.
   * @throws {Error} If the deckId is invalid or the database query fails.
   */
  public static async findById(deckId: string): Promise<Deck | null> {
    if (!deckId || deckId.trim() === '') {
      throw new Error('Invalid deckId provided to Deck.findById.')
    }

    try {
      const data = await dataRouter.findDeckById(deckId)
      return data ? Deck.fromJSON(data) : null
    } catch (error: unknown) {
      console.error(`Deck.findById failed for ID ${deckId}:`, error)
      throw error
    }
  }

  /**
   * @summary Retrieves all study decks belonging to a specific user.
   * @param {string} userId - The UUID of the user.
   * @returns {Promise<Deck[]>} A promise resolving to an array of instantiated Deck objects (empty array if none found).
   * @throws {Error} If the userId is invalid or the query fails.
   */
  public static async findAllForUser(userId: string): Promise<Deck[]> {
    if (!userId || userId.trim() === '') {
      throw new Error('Invalid userId provided to Deck.findAllForUser.')
    }

    try {
      const data = await dataRouter.findDecksForUser(userId)
      return data.map((row) => Deck.fromJSON(row))
    } catch (error: unknown) {
      console.error('Deck.findAllForUser failed:', error)
      throw error
    }
  }

  /**
   * @summary Instantiates a Deck object from a raw database record.
   * @param {unknown} json - The raw database JSON object from Supabase.
   * @returns {Deck} A fully typed Deck instance.
   * @throws {Error} If required fields are missing from the raw data.
   */
  public static fromJSON(json: unknown): Deck {
    if (!isDatabaseRecord(json)) {
      throw new Error('Invalid raw data: Cannot parse Deck from a non-object value.')
    }
    try {
      const sideLabels = json.side_labels
      const title = requiredString(json, 'title', 'Deck')
      if (!Array.isArray(sideLabels)) {
        throw new Error('Invalid raw data: Invalid side_labels to parse Deck.')
      }
      const parsedSideLabels = sideLabels.map((label): string => {
        if (
          typeof label !== 'string' ||
          !label.trim() ||
          databaseCharacterLength(label) > Deck.MAX_SIDE_LABEL_LENGTH
        ) {
          throw new Error('Invalid raw data: Invalid side_labels to parse Deck.')
        }
        return label
      })
      if (parsedSideLabels.length !== 2 && parsedSideLabels.length !== 3) {
        throw new Error('Invalid raw data: Invalid side_labels to parse Deck.')
      }
      if (databaseCharacterLength(title) > Deck.MAX_DATABASE_TITLE_LENGTH) {
        throw new Error('Invalid raw data: Deck title exceeds the database limit.')
      }
      const audioLanguages = Deck.parseAudioLanguages(json.audio_languages, parsedSideLabels.length)

      return new Deck(
        requiredString(json, 'id', 'Deck'),
        requiredString(json, 'user_id', 'Deck'),
        title,
        parsedSideLabels,
        requiredDate(json, 'created_at', 'Deck'),
        requiredDate(json, 'updated_at', 'Deck'),
        audioLanguages,
      )
    } catch (error: unknown) {
      throw new Error(`Failed to parse Deck from JSON: ${errorMessage(error)}`)
    }
  }

  /**
   * @summary Parses and validates a stored side-to-language map.
   * @param {unknown} value - The database value to parse.
   * @param {number} sideCount - The number of sides configured on the deck.
   * @returns {AudioLanguages} The validated map, or an empty map for legacy rows.
   * @throws {Error} If the stored map is malformed or configures an absent side.
   */
  private static parseAudioLanguages(value: unknown, sideCount: number): AudioLanguages {
    if (value === undefined) return {}
    if (!isDatabaseRecord(value)) {
      throw new Error('Invalid raw data: Invalid audio_languages to parse Deck.')
    }

    const audioLanguages: AudioLanguages = {}
    for (const [sideKey, languageCode] of Object.entries(value)) {
      if (!['s1', 's2', 's3'].includes(sideKey)) {
        throw new Error('Invalid raw data: Invalid audio_languages to parse Deck.')
      }
      assertLanguageCode(languageCode)
      const side = Number(sideKey.slice(1))
      if (side > sideCount) {
        throw new Error('Invalid raw data: Audio language is configured for a missing side.')
      }
      audioLanguages[sideKey as DeckSideKey] = languageCode
    }
    return audioLanguages
  }
}
