/**
 * @summary Represents a user profile mapped to Supabase Auth.
 */
export class Profile {
  constructor(
    public readonly id: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  /**
   * @summary Creates a Profile instance from a raw database record.
   * @param json Raw database object from Supabase.
   * @returns Instantiated Profile object.
   */
  public static fromJSON(json: any): Profile {
    if (!json || !json.id) {
      throw new Error("Invalid raw data: Cannot parse Profile from null or missing ID.");
    }
    try {
      return new Profile(
        json.id,
        new Date(json.created_at),
        new Date(json.updated_at)
      );
    } catch (error: any) {
      throw new Error(`Failed to parse Profile from JSON: ${error.message}`);
    }
  }
}