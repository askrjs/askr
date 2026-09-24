const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'sms', 'tel']);
const SCRIPT_URL_SCHEMES = new Set(['javascript', 'vbscript']);
const URL_SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

function urlScheme(value: string): string | undefined {
  // eslint-disable-next-line no-control-regex -- URL normalization intentionally removes ASCII and C1 controls.
  const compact = value.trim().replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  return URL_SCHEME_RE.exec(compact)?.[1]?.toLowerCase();
}

export function isSafeHref(value: string): boolean {
  const scheme = urlScheme(value);
  return scheme === undefined || SAFE_URL_SCHEMES.has(scheme);
}

/** Whether a resource URL avoids script-executing schemes; data:, blob: and custom schemes stay allowed. */
export function isSafeResourceUrl(value: string): boolean {
  const scheme = urlScheme(value);
  return scheme === undefined || !SCRIPT_URL_SCHEMES.has(scheme);
}

/**
 * Attribute names (lowercased) that can carry a browser-navigable/executable
 * URL and must be checked against isSafeHref. Shared between the client
 * renderer (renderer/attributes.ts) and SSR (ssr/attrs.ts) so their unsafe-
 * URL handling can't drift.
 */
export const UNSAFE_URL_SCHEME_ATTRIBUTES = new Set([
  'href',
  'formaction',
  'action',
  'xlink:href',
]);

/**
 * Resource attributes (lowercased) that execute script-scheme URLs, such as
 * `<iframe src>` and `<object data>`. They legitimately carry data:, blob: and
 * other non-navigable URLs, so only script schemes are rejected, not the
 * navigation allowlist.
 */
export const SCRIPT_URL_RESOURCE_ATTRIBUTES = new Set(['src', 'data']);

export function isUnsafeUrlAttribute(key: string, value: unknown): boolean {
  const name = key.toLowerCase();
  if (UNSAFE_URL_SCHEME_ATTRIBUTES.has(name)) return !isSafeHref(String(value));
  if (SCRIPT_URL_RESOURCE_ATTRIBUTES.has(name)) {
    return !isSafeResourceUrl(String(value));
  }
  return false;
}
