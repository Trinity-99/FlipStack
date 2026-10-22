import { errorMessage, isDatabaseRecord, optionalDate, requiredString } from '@/models/modelUtils'

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
  public static fromJSON(json: unknown): Profile {
    if (!isDatabaseRecord(json)) {
      throw new Error('Invalid raw data: Cannot parse Profile from a non-object value.')
    }
    try {
      const createdAt = optionalDate(json, 'created_at', 'Profile')
      const updatedAt = optionalDate(json, 'updated_at', 'Profile')
      if (!createdAt || !updatedAt) {
        throw new Error('Invalid raw data: Missing required timestamps to parse Profile.')
      }

      return new Profile(
        requiredString(json, 'id', 'Profile'),
        createdAt,
        updatedAt
      );
    } catch (error: unknown) {
      throw new Error(`Failed to parse Profile from JSON: ${errorMessage(error)}`);
    }
  }
}
