export type AuthenticationFailureKind = 'invalid-credentials' | 'network' | 'unexpected'

/**
 * @summary Represents a categorized failure during email and password authentication.
 * @param {AuthenticationFailureKind} kind - The category of failure.
 * @param {string} message - A safe description of the failure.
 * @param {unknown} originalError - The original failure, when available.
 */
export class AuthenticationError extends Error {
  constructor(
    public readonly kind: AuthenticationFailureKind,
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message)
    this.name = 'AuthenticationError'
  }
}
