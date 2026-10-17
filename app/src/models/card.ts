export interface CardContent {
  s1?: string;
  s2?: string;
  s3?: string;
}

/**
 * @summary Represents a 3-sided study card with optional fields and associated tags.
 */
export class Card {
  constructor(
    public readonly id: string,
    public readonly deckId: string,
    public readonly userId: string,
    public content: CardContent,
    public tagIds: string[],
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  /**
   * @summary Checks if the card has enough sides populated to be study-ready (at least 2 sides).
   * @returns True if ready for study sessions.
   */
  public isStudyReady(): boolean {
    try {
      const filledSides = Object.values(this.content).filter(
        val => val !== undefined && val.trim().length > 0
      );
      return filledSides.length >= 2;
    } catch (error) {
      return false;
    }
  }

  /**
   * @summary Creates a Card instance from a raw database record and associated tag IDs.
   * @param json Raw database object from Supabase.
   * @param tagIds Optional array of associated tag UUIDs.
   * @returns Instantiated Card object.
   */
  public static fromJSON(json: any, tagIds: string[] = []): Card {
    if (!json || !json.id || !json.deck_id || !json.user_id) {
      throw new Error("Invalid raw data: Missing required fields to parse Card.");
    }
    try {
      return new Card(
        json.id,
        json.deck_id,
        json.user_id,
        json.content || {},
        tagIds,
        new Date(json.created_at),
        new Date(json.updated_at)
      );
    } catch (error: any) {
      throw new Error(`Failed to parse Card from JSON: ${error.message}`);
    }
  }
}