import { defineScope, readScope, type Scope } from './runtime';

export const CspNonceScope: Scope<string | undefined> = defineScope<
  string | undefined
>(undefined);

export function cspNonce(): string | undefined {
  try {
    return readScope(CspNonceScope);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(
        'readScope() can only be called during component render'
      )
    ) {
      return undefined;
    }
    throw error;
  }
}

export function validateCspNonce(
  value: string | undefined
): string | undefined {
  if (value === undefined) return undefined;
  const invalid = (): never => {
    throw new TypeError(
      'CSP nonce must be valid base64 or base64url encoding at least 16 bytes.'
    );
  };
  if (
    value.length === 0 ||
    !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value) ||
    value.length % 4 === 1 ||
    /=/.test(value.slice(0, -2))
  ) {
    invalid();
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const unpadded = normalized.replace(/=+$/, '');
  const padded = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '=');
  let decoded = '';
  try {
    decoded = atob(padded);
  } catch {
    invalid();
  }
  if (decoded.length < 16) invalid();
  return value;
}
