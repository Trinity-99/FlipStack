import { supabase } from '@/db/supabase'
import { errorMessage, isDatabaseRecord, optionalDate, requiredString } from '@/models/modelUtils'

/**
 * @summary Represents a learning topic tag associated with a deck with active record persistence.
 */
export class Tag {
  constructor(
    public readonly id: string | null,
    public readonly deckId: string,
    public name: string,
    public readonly createdAt: Date | null
  ) {}

  /**
   * @summary Persists the tag to the database (Inserts if new, Updates if it exists).
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   * @throws {Error} If required fields are missing or the database operation fails.
   */
  public async save(): Promise<void> {
    if (!this.deckId || !this.name || this.name.trim() === '') {
      throw new Error('Cannot save Tag: Missing required fields (deckId or name).');
    }

    try {
      if (!this.id) {
        // INSERT new tag
        const { data, error } = await supabase
          .from('tag')
          .insert({
            deck_id: this.deckId,
            name: this.name.trim(),
          })
          .select()
          .single();

        if (error || !data) {
          throw new Error(`Database error while inserting tag: ${error?.message || 'No data returned'}`);
        }

        Object.assign(this, {
          id: data.id,
          createdAt: new Date(data.created_at),
        });
      } else {
        // UPDATE existing tag
        const { data, error } = await supabase
          .from('tag')
          .update({
            name: this.name.trim(),
          })
          .eq('id', this.id)
          .select()
          .single();

        if (error || !data) {
          throw new Error(`Database error while updating tag: ${error?.message || 'No data returned'}`);
        }
      }
    } catch (error: unknown) {
      console.error('Tag.save failed:', error);
      throw error;
    }
  }

  /**
   * @summary Deletes this tag from the database.
   * @returns {Promise<void>} A promise that resolves when deletion is complete.
   * @throws {Error} If the tag has no ID or the deletion fails.
   */
  public async delete(): Promise<void> {
    if (!this.id) {
      throw new Error('Cannot delete a tag that has not been saved to the database.');
    }

    try {
      const { error } = await supabase
        .from('tag')
        .delete()
        .eq('id', this.id);

      if (error) {
        throw new Error(`Database error while deleting tag: ${error.message}`);
      }
    } catch (error: unknown) {
      console.error(`Tag.delete failed for ID ${this.id}:`, error);
      throw error;
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
      throw new Error('Invalid tagId provided to Tag.findById.');
    }

    try {
      const { data, error } = await supabase
        .from('tag')
        .select('*')
        .eq('id', tagId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Database error while finding tag by ID: ${error.message}`);
      }

      return data ? Tag.fromJSON(data) : null;
    } catch (error: unknown) {
      console.error(`Tag.findById failed for ID ${tagId}:`, error);
      throw error;
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
      throw new Error('Invalid deckId provided to Tag.findAllForDeck.');
    }

    try {
      const { data, error } = await supabase
        .from('tag')
        .select('*')
        .eq('deck_id', deckId)
        .order('name', { ascending: true });

      if (error) {
        throw new Error(`Database error while fetching deck tags: ${error.message}`);
      }

      return (data || []).map(row => Tag.fromJSON(row));
    } catch (error: unknown) {
      console.error('Tag.findAllForDeck failed:', error);
      throw error;
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
      return new Tag(
        requiredString(json, 'id', 'Tag'),
        requiredString(json, 'deck_id', 'Tag'),
        requiredString(json, 'name', 'Tag'),
        optionalDate(json, 'created_at', 'Tag')
      );
    } catch (error: unknown) {
      throw new Error(`Failed to parse Tag from JSON: ${errorMessage(error)}`)
    }
  }
}