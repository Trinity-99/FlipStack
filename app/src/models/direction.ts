export type SideRole = 'question' | 'answer' | 'extra';

export interface DirectionStep {
  side: number; // 1, 2, or 3
  role: SideRole;
}

/**
 * @summary Represents a saved study direction configuration for a deck.
 */
export class Direction {
  constructor(
    public readonly id: string,
    public readonly deckId: string,
    public configuration: DirectionStep[]
  ) {}

  /**
   * @summary Finds the designated Question step for this direction.
   * @returns The direction step configured as the question, or undefined.
   */
  public getQuestionStep(): DirectionStep | undefined {
    return this.configuration.find(step => step.role === 'question');
  }

  /**
   * @summary Retrieves all Answer steps required for this direction.
   * @returns Array of answer steps.
   */
  public getAnswerSteps(): DirectionStep[] {
    return this.configuration.filter(step => step.role === 'answer');
  }

  /**
   * @summary Evaluates if a card has sufficient content to be studied under this direction.
   * @param cardContent Record mapping side keys (e.g., 's1', 's2', 's3') to text values.
   * @returns True if the card satisfies the question and all required answer slots.
   */
  public isCardEligible(cardContent: Record<string, string | undefined>): boolean {
    try {
      const questionStep = this.getQuestionStep();
      const answerSteps = this.getAnswerSteps();

      if (!questionStep) return false;

      // Question side must have content
      const questionVal = cardContent[`s${questionStep.side}`];
      if (!questionVal || questionVal.trim().length === 0) {
        return false;
      }

      // All answer sides must have content
      for (const ansStep of answerSteps) {
        const ansVal = cardContent[`s${ansStep.side}`];
        if (!ansVal || ansVal.trim().length === 0) {
          return false;
        }
      }

      return true;
    } catch (error: any) {
      console.error("Error evaluating card eligibility:", error);
      return false;
    }
  }

  /**
   * @summary Creates a Direction instance from a raw database record.
   * @param json Raw database object from Supabase.
   * @returns Instantiated Direction object.
   */
  public static fromJSON(json: any): Direction {
    if (!json || !json.id || !json.deck_id || !json.configuration) {
      throw new Error("Invalid raw data: Missing required fields to parse Direction.");
    }
    try {
      return new Direction(
        json.id,
        json.deck_id,
        json.configuration as DirectionStep[]
      );
    } catch (error: any) {
      throw new Error(`Failed to parse Direction from JSON: ${error.message}`);
    }
  }
}