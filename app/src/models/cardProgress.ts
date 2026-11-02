import { dataRouter } from '@/data/dataRouter'
import { errorMessage, isDatabaseRecord, requiredDate, requiredString } from '@/models/modelUtils'

/**
 * @summary Represents learning progress counters (0–10) per user, card, and direction with active record persistence.
 */
export class CardProgress {
  constructor(
    public readonly id: string | null,
    public readonly userId: string,
    public readonly cardId: string,
    public readonly directionId: string,
    public counter: number,
    public lastUpdated: Date,
  ) {
    if (!Number.isInteger(counter) || counter < 0 || counter > 10) {
      throw new Error(`Invalid counter value: ${counter}. Must be between 0 and 10.`)
    }
  }

  /**
   * @summary Persists progress to the database using upsert to honor the unique constraint (user_id, card_id, direction_id).
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   * @throws {Error} If required fields are missing or the database operation fails.
   */
  public async save(): Promise<void> {
    if (
      typeof this.userId !== 'string' ||
      !this.userId.trim() ||
      typeof this.cardId !== 'string' ||
      !this.cardId.trim() ||
      typeof this.directionId !== 'string' ||
      !this.directionId.trim()
    ) {
      throw new Error('Cannot save CardProgress: Missing required relational identifiers.')
    }
    if (!Number.isInteger(this.counter) || this.counter < 0 || this.counter > 10) {
      throw new Error(
        `Invalid counter value: ${this.counter}. Must be an integer between 0 and 10.`,
      )
    }
    if (!(this.lastUpdated instanceof Date) || Number.isNaN(this.lastUpdated.getTime())) {
      throw new Error('Cannot save CardProgress: Invalid lastUpdated date.')
    }

    try {
      const saved = await dataRouter.saveProgress({
        id: this.id ?? '',
        user_id: this.userId,
        card_id: this.cardId,
        direction_id: this.directionId,
        counter: this.counter,
        last_updated: this.lastUpdated.toISOString(),
      })

      Object.assign(this, {
        id: saved.id,
        counter: saved.counter,
        lastUpdated: new Date(saved.last_updated),
      })
    } catch (error: unknown) {
      console.error('CardProgress.save failed:', error)
      throw error
    }
  }

  /**
   * @summary Deletes this progress record from the database.
   * @returns {Promise<void>} A promise that resolves when deletion is complete.
   * @throws {Error} If the progress record has no ID or the deletion fails.
   */
  public async delete(): Promise<void> {
    if (!this.id) {
      throw new Error('Cannot delete a progress record that has not been saved to the database.')
    }

    try {
      await dataRouter.deleteProgress(this.id)
    } catch (error: unknown) {
      console.error(`CardProgress.delete failed for ID ${this.id}:`, error)
      throw error
    }
  }

  /**
   * @summary Finds progress for a specific user, card, and direction combination.
   * @param {string} userId - The user UUID.
   * @param {string} cardId - The card UUID.
   * @param {string} directionId - The direction UUID.
   * @returns {Promise<CardProgress | null>} A promise resolving to the CardProgress instance, or null if not found.
   * @throws {Error} If query fails.
   */
  public static async findForUserCardAndDirection(
    userId: string,
    cardId: string,
    directionId: string,
  ): Promise<CardProgress | null> {
    if (!userId || !cardId || !directionId) {
      throw new Error('Missing parameters provided to findForUserCardAndDirection.')
    }

    try {
      const data = await dataRouter.findProgressForUserCardAndDirection(
        userId,
        cardId,
        directionId,
      )
      return data ? CardProgress.fromJSON(data) : null
    } catch (error: unknown) {
      console.error('CardProgress.findForUserCardAndDirection failed:', error)
      throw error
    }
  }

  /**
   * @summary Retrieves all progress records for a user and saved study direction.
   * @param {string} userId - The authenticated user's UUID.
   * @param {string} directionId - The saved direction UUID.
   * @returns {Promise<CardProgress[]>} The matching progress records, or an empty array.
   * @throws {Error} If identifiers are invalid or the database query fails.
   */
  public static async findAllForUserAndDirection(
    userId: string,
    directionId: string,
  ): Promise<CardProgress[]> {
    if (!userId?.trim() || !directionId?.trim()) {
      throw new Error('Missing parameters provided to CardProgress.findAllForUserAndDirection.')
    }

    try {
      const data = await dataRouter.findProgressForUserAndDirection(userId, directionId)
      return data.map((row) => CardProgress.fromJSON(row))
    } catch (error: unknown) {
      console.error('CardProgress.findAllForUserAndDirection failed:', error)
      throw error
    }
  }

  /**
   * @summary Resets existing progress records for selected cards and a direction.
   * @param {string} userId - The authenticated user's UUID.
   * @param {string[]} cardIds - The eligible card UUIDs to reset.
   * @param {string} directionId - The saved direction UUID.
   * @returns {Promise<void>} A promise that resolves when matching progress is reset.
   * @throws {Error} If identifiers are invalid or the database update fails.
   */
  public static async resetForUserCardsAndDirection(
    userId: string,
    cardIds: string[],
    directionId: string,
  ): Promise<void> {
    if (!userId?.trim() || !directionId?.trim()) {
      throw new Error('Missing parameters provided to CardProgress.resetForUserCardsAndDirection.')
    }
    if (
      !Array.isArray(cardIds) ||
      !cardIds.every((cardId) => typeof cardId === 'string' && cardId.trim().length > 0) ||
      new Set(cardIds).size !== cardIds.length
    ) {
      throw new Error('Card IDs must be unique, non-empty strings.')
    }
    if (cardIds.length === 0) return

    try {
      await dataRouter.resetProgress(userId, cardIds, directionId)
    } catch (error: unknown) {
      console.error('CardProgress.resetForUserCardsAndDirection failed:', error)
      throw error
    }
  }

  /**
   * @summary Instantiates a CardProgress object from a raw database record.
   * @param {unknown} json - The raw database JSON object from Supabase.
   * @returns {CardProgress} A fully typed CardProgress instance.
   * @throws {Error} If required fields are missing from the raw data.
   */
  public static fromJSON(json: unknown): CardProgress {
    if (!isDatabaseRecord(json)) {
      throw new Error('Invalid raw data: Cannot parse CardProgress from a non-object value.')
    }
    try {
      const counter = json.counter
      if (typeof counter !== 'number' || !Number.isFinite(counter)) {
        throw new Error('Invalid raw data: Invalid counter to parse CardProgress.')
      }

      return new CardProgress(
        requiredString(json, 'id', 'CardProgress'),
        requiredString(json, 'user_id', 'CardProgress'),
        requiredString(json, 'card_id', 'CardProgress'),
        requiredString(json, 'direction_id', 'CardProgress'),
        counter,
        requiredDate(json, 'last_updated', 'CardProgress'),
      )
    } catch (error: unknown) {
      throw new Error(`Failed to parse CardProgress from JSON: ${errorMessage(error)}`)
    }
  }
}
