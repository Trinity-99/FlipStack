import { dataRouter } from '@/data/dataRouter'
import {
  databaseCharacterLength,
  errorMessage,
  isDatabaseRecord,
  requiredDate,
  requiredString,
} from '@/models/modelUtils'

/**
 * @summary Represents the content structure of a 3-sided study card.
 */
export interface CardContent {
  s1?: string
  s2?: string
  s3?: string
}

/**
 * @summary Represents a 3-sided study card with active record persistence and tag management.
 */
export class Card {
  public static readonly MAX_SIDE_LENGTH = 256
  private static readonly MAX_TAGS = 10

  constructor(
    public readonly id: string | null,
    public readonly deckId: string,
    public readonly userId: string,
    public content: CardContent,
    public tagIds: string[],
    public readonly createdAt: Date | null,
    public readonly updatedAt: Date | null,
  ) {}

  /**
   * @summary Checks if the card has enough sides populated to be study-ready (at least 2 sides).
   * @returns {boolean} True if ready for study sessions.
   */
  public isStudyReady(): boolean {
    try {
      const filledSides = Object.values(this.content).filter(
        (val) => val !== undefined && typeof val === 'string' && val.trim().length > 0,
      )
      return filledSides.length >= 2
    } catch (error) {
      console.error('Error checking if card is study-ready:', error)
      return false
    }
  }

  /**
   * @summary Persists the card and its associated tags to the database (Inserts if new, Updates if it exists).
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   * @throws {Error} If required fields are missing or the database operation fails.
   */
  public async save(): Promise<void> {
    this.validate()
    this.content = this.normalizeContent()

    try {
      const saved = await dataRouter.saveCard({
        id: this.id,
        deck_id: this.deckId,
        user_id: this.userId,
        content: this.content,
        tag_ids: this.tagIds,
      })
      Object.assign(this, {
        id: saved.id,
        createdAt: new Date(saved.created_at),
        updatedAt: new Date(saved.updated_at),
        tagIds: saved.tag_ids,
      })
    } catch (error: unknown) {
      console.error('Card.save failed:', error)
      throw error
    }
  }

  /**
   * @summary Validates and normalizes the card before persistence.
   * @returns {void}
   * @throws {Error} If identifiers or side content violate card requirements.
   */
  private validate(): void {
    if (
      typeof this.deckId !== 'string' ||
      !this.deckId.trim() ||
      typeof this.userId !== 'string' ||
      !this.userId.trim()
    ) {
      throw new Error('Cannot save Card: Missing required fields (deckId or userId).')
    }

    Card.validateContent(this.content, true)
    Card.validateTagIds(this.tagIds)

    const normalizedContent = this.normalizeContent()
    const sides = Object.entries(normalizedContent)
    if (sides.length === 0) {
      throw new Error('At least one side must contain text.')
    }

    const overlongSide = sides.find(([, value]) => value.length > Card.MAX_SIDE_LENGTH)
    if (overlongSide) {
      throw new Error(`Card sides cannot exceed ${Card.MAX_SIDE_LENGTH} characters.`)
    }
  }

  /**
   * @summary Trims side content and omits sides that are blank after trimming.
   * @returns {CardContent} Normalized card content.
   */
  private normalizeContent(): CardContent {
    const content: CardContent = {}
    for (const side of ['s1', 's2', 's3'] as const) {
      const value = this.content[side]?.trim()
      if (value) content[side] = value
    }
    return content
  }

  private static validateContent(
    content: unknown,
    allowUndefinedValues = false,
  ): asserts content is CardContent {
    if (!isDatabaseRecord(content)) {
      throw new Error('Card content must be an object containing valid side text.')
    }

    for (const [side, value] of Object.entries(content)) {
      if (side !== 's1' && side !== 's2' && side !== 's3') {
        throw new Error(`Invalid card side: ${side}.`)
      }
      if (
        (value === undefined && !allowUndefinedValues) ||
        (value !== undefined && typeof value !== 'string')
      ) {
        throw new Error(`Card content for ${side} must be text.`)
      }
      if (typeof value === 'string' && databaseCharacterLength(value) > Card.MAX_SIDE_LENGTH) {
        throw new Error(`Card sides cannot exceed ${Card.MAX_SIDE_LENGTH} characters.`)
      }
    }
  }

  private static validateTagIds(tagIds: unknown): asserts tagIds is string[] {
    if (!Array.isArray(tagIds)) {
      throw new Error(
        `Card tag IDs must be unique, non-empty strings with a maximum of ${Card.MAX_TAGS} tags.`,
      )
    }
    const ids: unknown[] = tagIds
    if (
      ids.length > Card.MAX_TAGS ||
      !ids.every((tagId: unknown) => typeof tagId === 'string' && tagId.trim().length > 0) ||
      new Set<unknown>(ids).size !== ids.length
    ) {
      throw new Error(
        `Card tag IDs must be unique, non-empty strings with a maximum of ${Card.MAX_TAGS} tags.`,
      )
    }
  }

  /**
   * @summary Deletes this card from the database.
   * @returns {Promise<void>} A promise that resolves when deletion is complete.
   * @throws {Error} If the card has no ID or the deletion fails.
   */
  public async delete(): Promise<void> {
    if (!this.id) {
      throw new Error('Cannot delete a card that has not been saved to the database.')
    }

    try {
      await dataRouter.deleteCard(this.id)
    } catch (error: unknown) {
      console.error(`Card.delete failed for ID ${this.id}:`, error)
      throw error
    }
  }

  /**
   * @summary Finds a single card by its unique identifier, including its associated tags.
   * @param {string} cardId - The UUID of the card to find.
   * @returns {Promise<Card | null>} A promise resolving to the Card instance, or null if not found.
   * @throws {Error} If the cardId is invalid or the database query fails.
   */
  public static async findById(cardId: string): Promise<Card | null> {
    if (!cardId || cardId.trim() === '') {
      throw new Error('Invalid cardId provided to Card.findById.')
    }

    try {
      const data = await dataRouter.findCardById(cardId)
      return data ? Card.fromJSON(data, data.tag_ids) : null
    } catch (error: unknown) {
      console.error(`Card.findById failed for ID ${cardId}:`, error)
      throw error
    }
  }

  /**
   * @summary Retrieves all cards belonging to a specific deck, including their associated tags.
   * @param {string} deckId - The UUID of the deck.
   * @returns {Promise<Card[]>} A promise resolving to an array of instantiated Card objects.
   * @throws {Error} If the deckId is invalid or the query fails.
   */
  public static async findAllForDeck(deckId: string): Promise<Card[]> {
    if (!deckId || deckId.trim() === '') {
      throw new Error('Invalid deckId provided to Card.findAllForDeck.')
    }

    try {
      const data = await dataRouter.findCardsForDeck(deckId)
      return data.map((row) => Card.fromJSON(row, row.tag_ids))
    } catch (error: unknown) {
      console.error('Card.findAllForDeck failed:', error)
      throw error
    }
  }

  /**
   * @summary Instantiates a Card object from a raw database record and associated tag IDs.
   * @param {unknown} json - The raw database JSON object from Supabase.
   * @param {string[] } [tagIds=[]] - Optional array of associated tag UUIDs.
   * @returns {Card} A fully typed Card instance.
   * @throws {Error} If required fields are missing from the raw data.
   */
  public static fromJSON(json: unknown, tagIds: string[] = []): Card {
    if (!isDatabaseRecord(json)) {
      throw new Error('Invalid raw data: Cannot parse Card from a non-object value.')
    }
    try {
      const content = json.content
      Card.validateContent(content)
      Card.validateTagIds(tagIds)

      return new Card(
        requiredString(json, 'id', 'Card'),
        requiredString(json, 'deck_id', 'Card'),
        requiredString(json, 'user_id', 'Card'),
        content,
        tagIds,
        requiredDate(json, 'created_at', 'Card'),
        requiredDate(json, 'updated_at', 'Card'),
      )
    } catch (error: unknown) {
      throw new Error(`Failed to parse Card from JSON: ${errorMessage(error)}`)
    }
  }
}
