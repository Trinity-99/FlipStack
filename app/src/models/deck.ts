/**
 * @summary Represents a study deck containing user-defined side labels.
 */
export class Deck {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public title: string,
    public sideLabels: string[],
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  /**
   * @summary Retrieves the human-readable label for a specific side number.
   * @param sideNum The side number (1, 2, or 3).
   * @returns The custom label for the side, or a fallback name.
   */
  public getSideLabel(sideNum: number): string {
    if (sideNum < 1 || sideNum > 3) {
      throw new Error(`Invalid side number: ${sideNum}. Side numbers must be between 1 and 3.`);
    }
    return this.sideLabels[sideNum - 1] || `Side ${sideNum}`;
  }

  /**
   * @summary Creates a Deck instance from a raw database record.
   * @param json Raw database object from Supabase.
   * @returns Instantiated Deck object.
   */
  public static fromJSON(json: any): Deck {
    if (!json || !json.id || !json.user_id) {
      throw new Error("Invalid raw data: Missing required fields to parse Deck.");
    }
    try {
      return new Deck(
        json.id,
        json.user_id,
        json.title,
        json.side_labels || ["Side 1", "Side 2", "Side 3"],
        new Date(json.created_at),
        new Date(json.updated_at)
      );
    } catch (error: any) {
      throw new Error(`Failed to parse Deck from JSON: ${error.message}`);
    }
  }
}
