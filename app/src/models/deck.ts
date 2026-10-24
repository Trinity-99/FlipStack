import { supabase } from '@/db/supabase'
import { errorMessage, isDatabaseRecord, optionalDate, requiredString } from '@/models/modelUtils'

/**
 * @summary Represents a study deck containing user-defined side labels and active record persistence.
 */
export class Deck {
  private static readonly MAX_TITLE_LENGTH = 24

  constructor(
    public readonly id: string | null,
    public readonly userId: string,
    public title: string,
    public sideLabels: string[],
    public readonly createdAt: Date | null,
    public readonly updatedAt: Date | null,
  ) {}

  /**
   * @summary Retrieves the human-readable label for a specific side number.
   * @param {number} sideNum - The side number to query (must be 1, 2, or 3).
   * @returns {string} The custom label for the side, or a fallback name.
   * @throws {Error} If the side number is out of bounds.
   */
  public getSideLabel(sideNum: number): string {
    if (sideNum < 1 || sideNum > 3) {
      throw new Error(`Invalid side number: ${sideNum}. Side numbers must be between 1 and 3.`)
    }
    return this.sideLabels[sideNum - 1] || `Side ${sideNum}`
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
      if (!this.id) {
        // INSERT new deck
        const { data, error } = await supabase
          .from('deck')
          .insert({
            user_id: this.userId,
            title: this.title,
            side_labels: this.sideLabels,
          })
          .select()
          .single()

        if (error || !data) {
          throw new Error(
            `Database error while inserting deck: ${error?.message || 'No data returned'}`,
          )
        }

        // Mutate instance with generated database values
        Object.assign(this, {
          id: data.id,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
        })
      } else {
        // UPDATE existing deck
        const { data, error } = await supabase
          .from('deck')
          .update({
            title: this.title,
            side_labels: this.sideLabels,
          })
          .eq('id', this.id)
          .select()
          .single()

        if (error || !data) {
          throw new Error(
            `Database error while updating deck: ${error?.message || 'No data returned'}`,
          )
        }

        Object.assign(this, {
          updatedAt: new Date(data.updated_at),
        })
      }
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
    if (!this.userId || !this.userId.trim()) {
      throw new Error('Cannot save Deck: Missing required userId.')
    }
    if (!this.title || !this.title.trim()) {
      throw new Error('Deck name is required.')
    }
    if (this.title.trim().length > Deck.MAX_TITLE_LENGTH) {
      throw new Error('Deck name cannot exceed 24 characters')
    }
    if (this.sideLabels.length !== 2 && this.sideLabels.length !== 3) {
      throw new Error('A deck must have exactly two or three side labels.')
    }
    if (this.sideLabels.some((label) => !label.trim())) {
      throw new Error('All deck side labels are required.')
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
      const { error } = await supabase.from('deck').delete().eq('id', this.id)

      if (error) {
        throw new Error(`Database error while deleting deck: ${error.message}`)
      }
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
      const { data, error } = await supabase.from('deck').select('*').eq('id', deckId).single()

      if (error) {
        if (error.code === 'PGRST116') return null
        throw new Error(`Database error while finding deck by ID: ${error.message}`)
      }

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
      const { data, error } = await supabase
        .from('deck')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(`Database error while fetching user decks: ${error.message}`)
      }

      return (data || []).map((row) => Deck.fromJSON(row))
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
      if (
        sideLabels !== undefined &&
        sideLabels !== null &&
        (!Array.isArray(sideLabels) ||
          !sideLabels.every((label): label is string => typeof label === 'string'))
      ) {
        throw new Error('Invalid raw data: Invalid side_labels to parse Deck.')
      }

      return new Deck(
        requiredString(json, 'id', 'Deck'),
        requiredString(json, 'user_id', 'Deck'),
        requiredString(json, 'title', 'Deck'),
        sideLabels ?? ['Side 1', 'Side 2', 'Side 3'],
        optionalDate(json, 'created_at', 'Deck'),
        optionalDate(json, 'updated_at', 'Deck'),
      )
    } catch (error: unknown) {
      throw new Error(`Failed to parse Deck from JSON: ${errorMessage(error)}`)
    }
  }
}
