import { supabase } from '@/db/supabase'
import { Card } from '@/models/card'

export type SideRole = 'question' | 'answer' | 'extra';

export interface DirectionStep {
  side: number; // 1, 2, or 3
  role: SideRole;
}

/**
 * @summary Represents a saved study direction configuration for a deck with active record persistence.
 */
export class Direction {
  constructor(
    public readonly id: string | null,
    public readonly deckId: string,
    public configuration: DirectionStep[],
    public readonly createdAt: Date | null
  ) {}

  /**
   * @summary Finds the designated Question step for this direction.
   * @returns {DirectionStep | undefined} The direction step configured as the question, or undefined.
   */
  public getQuestionStep(): DirectionStep | undefined {
    return this.configuration.find(step => step.role === 'question');
  }

  /**
   * @summary Retrieves all Answer steps required for this direction.
   * @returns {DirectionStep[]} Array of answer steps.
   */
  public getAnswerSteps(): DirectionStep[] {
    return this.configuration.filter(step => step.role === 'answer');
  }

  /**
   * @summary Evaluates if a card has sufficient content to be studied under this direction.
   * @param {Card} card - The Card object to evaluate.
   * @returns {boolean} True if the card satisfies the question and all required answer slots.
   */
  public isCardEligible(card: Card): boolean {
    if (!card || !card.content) return false;

    try {
      const questionStep = this.getQuestionStep();
      const answerSteps = this.getAnswerSteps();

      if (!questionStep) return false;

      // Question side must have content
      const questionVal = card.content[`s${questionStep.side}` as keyof typeof card.content];
      if (!questionVal || questionVal.trim().length === 0) {
        return false;
      }

      // All answer sides must have content
      for (const ansStep of answerSteps) {
        const ansVal = card.content[`s${ansStep.side}` as keyof typeof card.content];
        if (!ansVal || ansVal.trim().length === 0) {
          return false;
        }
      }

      return true;
    } catch (error: any) {
      console.error('Error evaluating card eligibility:', error);
      return false;
    }
  }

  /**
   * @summary Persists the direction configuration to the database (Inserts if new, Updates if it exists).
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   * @throws {Error} If required fields are missing or the database operation fails.
   */
  public async save(): Promise<void> {
    if (!this.deckId || !this.configuration || this.configuration.length === 0) {
      throw new Error('Cannot save Direction: Missing required fields (deckId or configuration).');
    }

    try {
      if (!this.id) {
        // INSERT new direction
        const { data, error } = await supabase
          .from('direction')
          .insert({
            deck_id: this.deckId,
            configuration: this.configuration,
          })
          .select()
          .single();

        if (error || !data) {
          throw new Error(`Database error while inserting direction: ${error?.message || 'No data returned'}`);
        }

        Object.assign(this, {
          id: data.id,
          createdAt: new Date(data.created_at),
        });
      } else {
        // UPDATE existing direction
        const { data, error } = await supabase
          .from('direction')
          .update({
            configuration: this.configuration,
          })
          .eq('id', this.id)
          .select()
          .single();

        if (error || !data) {
          throw new Error(`Database error while updating direction: ${error?.message || 'No data returned'}`);
        }
      }
    } catch (error: any) {
      console.error('Direction.save failed:', error);
      throw error;
    }
  }

  /**
   * @summary Deletes this direction from the database.
   * @returns {Promise<void>} A promise that resolves when deletion is complete.
   * @throws {Error} If the direction has no ID or the deletion fails.
   */
  public async delete(): Promise<void> {
    if (!this.id) {
      throw new Error('Cannot delete a direction that has not been saved to the database.');
    }

    try {
      const { error } = await supabase
        .from('direction')
        .delete()
        .eq('id', this.id);

      if (error) {
        throw new Error(`Database error while deleting direction: ${error.message}`);
      }
    } catch (error: any) {
      console.error(`Direction.delete failed for ID ${this.id}:`, error);
      throw error;
    }
  }

  /**
   * @summary Finds a single direction by its unique identifier.
   * @param {string} directionId - The UUID of the direction to find.
   * @returns {Promise<Direction | null>} A promise resolving to the Direction instance, or null if not found.
   * @throws {Error} If the directionId is invalid or the database query fails.
   */
  public static async findById(directionId: string): Promise<Direction | null> {
    if (!directionId || directionId.trim() === '') {
      throw new Error('Invalid directionId provided to Direction.findById.');
    }

    try {
      const { data, error } = await supabase
        .from('direction')
        .select('*')
        .eq('id', directionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Database error while finding direction by ID: ${error.message}`);
      }

      return data ? Direction.fromJSON(data) : null;
    } catch (error: any) {
      console.error(`Direction.findById failed for ID ${directionId}:`, error);
      throw error;
    }
  }

  /**
   * @summary Retrieves all study directions configured for a specific deck.
   * @param {string} deckId - The UUID of the deck.
   * @returns {Promise<Direction[]>} A promise resolving to an array of instantiated Direction objects.
   * @throws {Error} If the deckId is invalid or the query fails.
   */
  public static async findAllForDeck(deckId: string): Promise<Direction[]> {
    if (!deckId || deckId.trim() === '') {
      throw new Error('Invalid deckId provided to Direction.findAllForDeck.');
    }

    try {
      const { data, error } = await supabase
        .from('direction')
        .select('*')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Database error while fetching deck directions: ${error.message}`);
      }

      return (data || []).map((row: any) => Direction.fromJSON(row));
    } catch (error: any) {
      console.error('Direction.findAllForDeck failed:', error);
      throw error;
    }
  }

  /**
   * @summary Instantiates a Direction object from a raw database record.
   * @param {any} json - The raw database JSON object from Supabase.
   * @returns {Direction} A fully typed Direction instance.
   * @throws {Error} If required fields are missing from the raw data.
   */
  public static fromJSON(json: any): Direction {
    if (!json || !json.id || !json.deck_id || !json.configuration) {
      throw new Error('Invalid raw data: Missing required fields to parse Direction.');
    }
    try {
      return new Direction(
        json.id,
        json.deck_id,
        json.configuration as DirectionStep[],
        json.created_at ? new Date(json.created_at) : null
      );
    } catch (error: any) {
      throw new Error(`Failed to parse Direction from JSON: ${error.message}`);
    }
  }
}
