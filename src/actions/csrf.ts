import { isHydratedCsrfTokenRevoked } from '../common/csrf-token';

const TOKEN_PATTERN = /^[\x21-\x7e]+$/;
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function usable(value: string | null | undefined): string | undefined {
  const token = value?.trim();
  return token && TOKEN_PATTERN.test(token) ? token : undefined;
}

function readMetaToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return usable(
    document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
  );
}

function readCookieToken(name: string | undefined): string | undefined {
  if (!name || typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return usable(decodeURIComponent(raw));
    } catch {
      return usable(raw);
    }
  }
  return undefined;
}

/** Whether `name` can name a cookie (an HTTP token). */
export function isCsrfCookieName(name: unknown): name is string {
  return typeof name === 'string' && COOKIE_NAME_PATTERN.test(name);
}

/**
 * The token an action submission carries when the application gave no
 * resolver, read at submit time: the hydration envelope token (until the
 * session identity changes), else the `csrf-token` meta element, else the
 * cookie named by `csrfCookie`.
 */
export function readSubmitTimeCsrfToken(
  hydrated: string | undefined,
  cookieName: string | undefined
): string | undefined {
  return (
    (isHydratedCsrfTokenRevoked() ? undefined : usable(hydrated)) ??
    readMetaToken() ??
    readCookieToken(cookieName)
  );
}
