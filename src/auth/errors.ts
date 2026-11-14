export type AuthErrorCode =
  | 'config'       // client id / scheme / discovery not set up
  | 'unavailable'  // native module missing in this build
  | 'network'      // offline or timed out
  | 'cancelled'    // user closed the login page
  | 'expired'      // session can no longer be refreshed: sign in again
  | 'locked'       // biometric lock is on
  | 'server';      // anything else from Shopify

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message || code);
    this.name = 'AuthError';
    this.code = code;
  }
}
export const isAuthError = (e: unknown, code?: AuthErrorCode): e is AuthError =>
  e instanceof AuthError && (!code || e.code === code);

/** Any thrown value -> AuthError. Fetch failures and timeouts become `network`. */
export function toAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const name = (e as { name?: string } | null)?.name ?? '';
  const msg = String((e as { message?: string } | null)?.message ?? e ?? '');
  if (name === 'AbortError' || name === 'TimeoutError' || name === 'TypeError' || /network|timed? ?out|failed to fetch/i.test(msg)) {
    return new AuthError('network', msg);
  }
  return new AuthError('server', msg);
}
