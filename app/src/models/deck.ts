import { supabase } from '@/db/supabase'

/**
 * @summary Represents a study deck containing user-defined side labels and active record persistence.
 */
export class Deck {
  constructor(
    public readonly id: string | null,
    public readonly userId: string,
    public title: string,
    public sideLabels: string[],
    public readonly createdAt: Date | null,
    public readonly updatedAt: Date | null
  ) {}

  /**
   * @summary Retrieves the human-readable label for a specific side number.
   * @param {number} sideNum - The side number to query (must be 1, 2, or 3).
   * @returns {string} The custom label for the side, or a fallback name.
   * @throws {Error} If the side number is out of bounds.
   */
  public getSideLabel(sideNum: number): string {
    if (sideNum < 1 || sideNum > 3) {
      throw new Error(`Invalid side number: ${sideNum}. Side numbers must be between 1 and 3.`);
    }
    return this.sideLabels[sideNum - 1] || `Side ${sideNum}`;
  }

  /**
   * @summary Persists the deck to the database. Inserts a new record if ID is null, otherwise updates the existing record.
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   * @throws {Error} If required fields are missing or the database operation fails.
   */
  public async save(): Promise<void> {
    if (!this.userId || !this.title || this.title.trim() === '') {
      throw new Error('Cannot save Deck: Missing required fields (userId or title).');
    }

    try {
      if (!this.id) {
        // INSERT new deck
        const { data, error } = await supabase
          .from('deck')
          .insert({
            user_id: this.userId,
            title: this.title.trim(),
            side_labels: this.sideLabels,
          })
          .select()
          .single();

        if (error || !data) {
          throw new Error(`Database error while inserting deck: ${error?.message || 'No data returned'}`);
        }

        // Mutate instance with generated database values
        Object.assign(this, {
          id: data.id,
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at),
        });
      } else {
        // UPDATE existing deck
        const { data, error } = await supabase
          .from('deck')
          .update({
            title: this.title.trim(),
            side_labels: this.sideLabels,
          })
          .eq('id', this.id)
          .select()
          .single();

        if (error || !data) {
          throw new Error(`Database error while updating deck: ${error?.message || 'No data returned'}`);
        }

        Object.assign(this, {
          updatedAt: new Date(data.updated_at),
        });
      }
    } catch (error: any) {
      console.error('Deck.save failed:', error);
      throw error;
    }
  }

  /**
   * @summary Deletes this deck from the database.
   * @returns {Promise<void>} A promise that resolves when deletion is complete.
   * @throws {Error} If the deck has no ID or the deletion fails.
   */
  public async delete(): Promise<void> {
    if (!this.id) {
      throw new Error('Cannot delete a deck that has not been saved to the database.');
    }

    try {
      const { error } = await supabase
        .from('deck')
        .delete()
        .eq('id', this.id);

      if (error) {
        throw new Error(`Database error while deleting deck: ${error.message}`);
      }
    } catch (error: any) {
      console.error(`Deck.delete failed for ID ${this.id}:`, error);
      throw error;
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
      throw new Error('Invalid deckId provided to Deck.findById.');
    }

    try {
      const { data, error } = await supabase
        .from('deck')
        .select('*')
        .eq('id', deckId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Database error while finding deck by ID: ${error.message}`);
      }

      return data ? Deck.fromJSON(data) : null;
    } catch (error: any) {
      console.error(`Deck.findById failed for ID ${deckId}:`, error);
      throw error;
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
      throw new Error('Invalid userId provided to Deck.findAllForUser.');
    }

    try {
      const { data, error } = await supabase
        .from('deck')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Database error while fetching user decks: ${error.message}`);
      }

      return (data || []).map((row: any) => Deck.fromJSON(row));
    } catch (error: any) {
      console.error('Deck.findAllForUser failed:', error);
      throw error;
    }
  }

  /**
   * @summary Instantiates a Deck object from a raw database record.
   * @param {any} json - The raw database JSON object from Supabase.
   * @returns {Deck} A fully typed Deck instance.
   * @throws {Error} If required fields are missing from the raw data.
   */
  public static fromJSON(json: any): Deck {
    if (!json || !json.id || !json.user_id) {
      throw new Error('Invalid raw data: Missing required fields to parse Deck.');
    }
    try {
      return new Deck(
        json.id,
        json.user_id,
        json.title,
        json.side_labels || ['Side 1', 'Side 2', 'Side 3'],
        json.created_at ? new Date(json.created_at) : null,
        json.updated_at ? new Date(json.updated_at) : null
      );
    } catch (error: any) {
      throw new Error(`Failed to parse Deck from JSON: ${error.message}`);
    }
  }
}