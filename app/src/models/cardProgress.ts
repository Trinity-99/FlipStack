import { supabase } from '@/db/supabase'

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
    public lastUpdated: Date
  ) {
    if (counter < 0 || counter > 10) {
      throw new Error(`Invalid counter value: ${counter}. Must be between 0 and 10.`);
    }
  }

  /**
   * @summary Computes the selection weight for the continuous learning stream (Weight = 10 - counter).
   * @returns {number} Numerical weight for random weighted draw.
   */
  public getWeight(): number {
    return Math.max(0, 10 - this.counter);
  }

  /**
   * @summary Increments counter by 1 ("Got It" action), capped at 10.
   */
  public increment(): void {
    if (this.counter < 10) {
      this.counter += 1;
      this.lastUpdated = new Date();
    }
  }

  /**
   * @summary Decrements counter by 1 ("Needs Review" action), floored at 0.
   */
  public decrement(): void {
    if (this.counter > 0) {
      this.counter -= 1;
      this.lastUpdated = new Date();
    }
  }

  /**
   * @summary Persists progress to the database using upsert to honor the unique constraint (user_id, card_id, direction_id).
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   * @throws {Error} If required fields are missing or the database operation fails.
   */
  public async save(): Promise<void> {
    if (!this.userId || !this.cardId || !this.directionId) {
      throw new Error('Cannot save CardProgress: Missing required relational identifiers.');
    }

    try {
      const { data, error } = await supabase
        .from('card_progress')
        .upsert(
          {
            user_id: this.userId,
            card_id: this.cardId,
            direction_id: this.directionId,
            counter: this.counter,
            last_updated: this.lastUpdated.toISOString(),
          },
          { onConflict: 'user_id,card_id,direction_id' }
        )
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Database error while saving card progress: ${error?.message || 'No data returned'}`);
      }

      Object.assign(this, {
        id: data.id,
        counter: data.counter,
        lastUpdated: new Date(data.last_updated),
      });
    } catch (error: any) {
      console.error('CardProgress.save failed:', error);
      throw error;
    }
  }

  /**
   * @summary Deletes this progress record from the database.
   * @returns {Promise<void>} A promise that resolves when deletion is complete.
   * @throws {Error} If the progress record has no ID or the deletion fails.
   */
  public async delete(): Promise<void> {
    if (!this.id) {
      throw new Error('Cannot delete a progress record that has not been saved to the database.');
    }

    try {
      const { error } = await supabase
        .from('card_progress')
        .delete()
        .eq('id', this.id);

      if (error) {
        throw new Error(`Database error while deleting card progress: ${error.message}`);
      }
    } catch (error: any) {
      console.error(`CardProgress.delete failed for ID ${this.id}:`, error);
      throw error;
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
    directionId: string
  ): Promise<CardProgress | null> {
    if (!userId || !cardId || !directionId) {
      throw new Error('Missing parameters provided to findForUserCardAndDirection.');
    }

    try {
      const { data, error } = await supabase
        .from('card_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('card_id', cardId)
        .eq('direction_id', directionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Database error while finding card progress: ${error.message}`);
      }

      return data ? CardProgress.fromJSON(data) : null;
    } catch (error: any) {
      console.error('CardProgress.findForUserCardAndDirection failed:', error);
      throw error;
    }
  }

  /**
   * @summary Instantiates a CardProgress object from a raw database record.
   * @param {any} json - The raw database JSON object from Supabase.
   * @returns {CardProgress} A fully typed CardProgress instance.
   * @throws {Error} If required fields are missing from the raw data.
   */
  public static fromJSON(json: any): CardProgress {
    if (!json || !json.id || !json.user_id || !json.card_id || !json.direction_id) {
      throw new Error('Invalid raw data: Missing required fields to parse CardProgress.');
    }
    try {
      return new CardProgress(
        json.id,
        json.user_id,
        json.card_id,
        json.direction_id,
        json.counter ?? 0,
        new Date(json.last_updated || Date.now())
      );
    } catch (error: any) {
      throw new Error(`Failed to parse CardProgress from JSON: ${error.message}`);
    }
  }
}