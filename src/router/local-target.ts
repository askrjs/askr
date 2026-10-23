import { formatNavigationUrl, resolveNavigationUrl } from '../common/url';

/**
 * Reduce an untrusted navigation target (a `?next=` query value, a form field)
 * to a same-origin root-relative href, or `fallback` when it names anything
 * else. Relative values resolve against the origin root. The checks are those
 * of `navigate()`: another origin, a path-like value the URL parser resolves
 * to another host (`//evil.example`, `/\evil.example`), a pathname that
 * collapses to a leading `//`, and non-http schemes all use the fallback.
 * On a server, where the origin is unknown, only root-relative values pass.
 */
export function localTarget(value: string | null, fallback = '/'): string {
  if (!value) return fallback;
  try {
    const base =
      typeof window === 'undefined' ? undefined : `${window.location.origin}/`;
    const url = resolveNavigationUrl(value, base);
    const baseOrigin = new URL(base ?? 'http://askr.invalid/').origin;
    if (url.origin !== baseOrigin) return fallback;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
    return formatNavigationUrl(url, base);
  } catch {
    return fallback;
  }
}
