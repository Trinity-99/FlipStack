export type DatabaseRecord = Record<string, unknown>

/**
 * @summary Checks whether a value is a non-null object record.
 * @param {unknown} value - The value to check.
 * @returns {value is DatabaseRecord} True when the value is a record.
 */
export function isDatabaseRecord(value: unknown): value is DatabaseRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @summary Reads a required non-empty string from a database record.
 * @param {DatabaseRecord} record - The database record to read.
 * @param {string} key - The property name.
 * @param {string} modelName - The model being parsed.
 * @returns {string} The property value.
 * @throws {Error} If the property is missing or is not a non-empty string.
 */
export function requiredString(record: DatabaseRecord, key: string, modelName: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid raw data: Missing or invalid ${key} to parse ${modelName}.`)
  }
  return value
}

/**
 * @summary Reads an optional date value from a database record.
 * @param {DatabaseRecord} record - The database record to read.
 * @param {string} key - The property name.
 * @param {string} modelName - The model being parsed.
 * @returns {Date | null} The parsed date or null when the property is absent.
 * @throws {Error} If the property cannot be parsed as a valid date.
 */
export function optionalDate(record: DatabaseRecord, key: string, modelName: string): Date | null {
  const value = record[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`Invalid raw data: Invalid ${key} to parse ${modelName}.`)
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid raw data: Invalid ${key} to parse ${modelName}.`)
  }
  return date
}

/**
 * @summary Reads a required date value from a database record.
 * @param {DatabaseRecord} record - The database record to read.
 * @param {string} key - The property name.
 * @param {string} modelName - The model being parsed.
 * @returns {Date} The parsed date.
 * @throws {Error} If the property is absent or cannot be parsed as a valid date.
 */
export function requiredDate(record: DatabaseRecord, key: string, modelName: string): Date {
  const date = optionalDate(record, key, modelName)
  if (!date) {
    throw new Error(`Invalid raw data: Missing required ${key} to parse ${modelName}.`)
  }
  return date
}

/**
 * @summary Counts Unicode code points, matching PostgreSQL char_length for UTF-8 text.
 * @param {string} value - The text to count.
 * @returns {number} The number of Unicode code points.
 */
export function databaseCharacterLength(value: string): number {
  let characterCount = 0
  for (const _character of value) {
    characterCount += 1
  }
  return characterCount
}

/**
 * @summary Reads an optional string value from a database record.
 * @param {DatabaseRecord} record - The database record to read.
 * @param {string} key - The property name.
 * @param {string} modelName - The model being parsed.
 * @returns {string | null} The property value or null when the property is absent.
 * @throws {Error} If the property is present but is not a string.
 */
export function optionalString(
  record: DatabaseRecord,
  key: string,
  modelName: string,
): string | null {
  const value = record[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new Error(`Invalid raw data: Invalid ${key} to parse ${modelName}.`)
  }
  return value
}

/**
 * @summary Converts a caught value into a readable error message.
 * @param {unknown} error - The caught value.
 * @returns {string} The error message or string representation.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
