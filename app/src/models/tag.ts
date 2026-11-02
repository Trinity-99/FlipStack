import { dataRouter } from '@/data/dataRouter'
import {
  databaseCharacterLength,
  errorMessage,
  isDatabaseRecord,
  requiredDate,
  requiredString,
} from '@/models/modelUtils'

/**
 * @summary Represents a learning topic tag associated with a deck with active record persistence.
 */
export class Tag {
  private static readonly MAX_NAME_LENGTH = 32

  constructor(
    public readonly id: string | null,
    public readonly deckId: string,
    public name: string,
    public readonly createdAt: Date | null,
  ) {}

  /**
   * @summary Persists the tag to the database (Inserts if new, Updates if it exists).
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   * @throws {Error} If required fields are missing or the database operation fails.
   */
  public async save(): Promise<void> {
    if (typeof this.deckId !== 'string' || !this.deckId.trim()) {
      throw new Error('Cannot save Tag: Missing required deckId.')
    }
    if (typeof this.name !== 'string' || !this.name.trim()) {
      throw new Error('Cannot save Tag: Missing required fields (deckId or name).')
    }
    if (databaseCharacterLength(this.name.trim()) > Tag.MAX_NAME_LENGTH) {
      throw new Error(`Tag name cannot exceed ${Tag.MAX_NAME_LENGTH} characters.`)
    }

    try {
      const saved = await dataRouter.saveTag({
        id: this.id,
        deck_id: this.deckId,
        name: this.name.trim(),
      })
      Object.assign(this, { id: saved.id, createdAt: new Date(saved.created_at) })
    } catch (error: unknown) {
      console.error('Tag.save failed:', error)
      throw error
    }
  }

  /**
   * @summary Deletes this tag from the database.
   * @returns {Promise<void>} A promise that resolves when deletion is complete.
   * @throws {Error} If the tag has no ID or the deletion fails.
   */
  public async delete(): Promise<void> {
    if (!this.id) {
      throw new Error('Cannot delete a tag that has not been saved to the database.')
    }

    try {
      await dataRouter.deleteTag(this.id)
    } catch (error: unknown) {
      console.error(`Tag.delete failed for ID ${this.id}:`, error)
      throw error
    }
  }

  /**
   * @summary Finds a single tag by its unique identifier.
   * @param {string} tagId - The UUID of the tag to find.
   * @returns {Promise<Tag | null>} A promise resolving to the Tag instance, or null if not found.
   * @throws {Error} If the tagId is invalid or the database query fails.
   */
  public static async findById(tagId: string): Promise<Tag | null> {
    if (!tagId || tagId.trim() === '') {
      throw new Error('Invalid tagId provided to Tag.findById.')
    }

    try {
      const data = await dataRouter.findTagById(tagId)
      return data ? Tag.fromJSON(data) : null
    } catch (error: unknown) {
      console.error(`Tag.findById failed for ID ${tagId}:`, error)
      throw error
    }
  }

  /**
   * @summary Retrieves all tags belonging to a specific deck.
   * @param {string} deckId - The UUID of the deck.
   * @returns {Promise<Tag[]>} A promise resolving to an array of instantiated Tag objects.
   * @throws {Error} If the deckId is invalid or the query fails.
   */
  public static async findAllForDeck(deckId: string): Promise<Tag[]> {
    if (!deckId || deckId.trim() === '') {
      throw new Error('Invalid deckId provided to Tag.findAllForDeck.')
    }

    try {
      const data = await dataRouter.findTagsForDeck(deckId)
      return data.map((row) => Tag.fromJSON(row))
    } catch (error: unknown) {
      console.error('Tag.findAllForDeck failed:', error)
      throw error
    }
  }

  /**
   * @summary Instantiates a Tag object from a raw database record.
   * @param {unknown} json - The raw database JSON object from Supabase.
   * @returns {Tag} A fully typed Tag instance.
   * @throws {Error} If required fields are missing from the raw data.
   */
  public static fromJSON(json: unknown): Tag {
    if (!isDatabaseRecord(json)) {
      throw new Error('Invalid raw data: Cannot parse Tag from a non-object value.')
    }
    try {
      const name = requiredString(json, 'name', 'Tag')
      if (databaseCharacterLength(name) > Tag.MAX_NAME_LENGTH) {
        throw new Error(`Invalid raw data: Tag name exceeds ${Tag.MAX_NAME_LENGTH} characters.`)
      }

      return new Tag(
        requiredString(json, 'id', 'Tag'),
        requiredString(json, 'deck_id', 'Tag'),
        name,
        requiredDate(json, 'created_at', 'Tag'),
      )
    } catch (error: unknown) {
      throw new Error(`Failed to parse Tag from JSON: ${errorMessage(error)}`)
    }
  }
}
