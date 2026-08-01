const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'sms', 'tel']);
const URL_SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

export function isSafeHref(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- URL normalization intentionally removes ASCII and C1 controls.
  const compact = value.trim().replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  const scheme = URL_SCHEME_RE.exec(compact)?.[1]?.toLowerCase();
  return scheme === undefined || SAFE_URL_SCHEMES.has(scheme);
}

/**
 * Attribute names (lowercased) that can carry a browser-navigable/executable
 * URL and must be checked against isSafeHref. Shared between the client
 * renderer (renderer/attributes.ts) and SSR (ssr/attrs.ts) so their unsafe-
 * URL handling can't drift. Deliberately excludes `src`: it covers a much
 * wider range of legitimate non-navigable values (data: image URIs, blob:
 * URLs, etc.) where the same scheme allowlist would be overly aggressive.
 */
export const UNSAFE_URL_SCHEME_ATTRIBUTES = new Set([
  'href',
  'formaction',
  'action',
  'xlink:href',
]);

export function isUnsafeUrlAttribute(key: string, value: unknown): boolean {
  return (
    UNSAFE_URL_SCHEME_ATTRIBUTES.has(key.toLowerCase()) &&
    !isSafeHref(String(value))
  );
}
