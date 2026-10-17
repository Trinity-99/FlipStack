/**
 * @summary Represents learning progress counters (0–10) per user, card, and direction.
 */
export class CardProgress {
  constructor(
    public readonly id: string,
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
   * @returns Numerical weight for random weighted draw.
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
   * @summary Creates a CardProgress instance from a raw database record.
   * @param json Raw database object from Supabase.
   * @returns Instantiated CardProgress object.
   */
  public static fromJSON(json: any): CardProgress {
    if (!json || !json.id || !json.user_id || !json.card_id || !json.direction_id) {
      throw new Error("Invalid raw data: Missing required fields to parse CardProgress.");
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
