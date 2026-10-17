/**
 * @summary Represents a learning topic tag associated with a deck.
 */
export class Tag {
  constructor(
    public readonly id: string,
    public readonly deckId: string,
    public name: string,
    public readonly createdAt: Date
  ) {}

  /**
   * @summary Creates a Tag instance from a raw database record.
   * @param json Raw database object from Supabase.
   * @returns Instantiated Tag object.
   */
  public static fromJSON(json: any): Tag {
    if (!json || !json.id || !json.deck_id || !json.name) {
      throw new Error("Invalid raw data: Missing required fields to parse Tag.");
    }
    try {
      return new Tag(
        json.id,
        json.deck_id,
        json.name,
        new Date(json.created_at)
      );
    } catch (error: any) {
      throw new Error(`Failed to parse Tag from JSON: ${error.message}`);
    }
  }
}
