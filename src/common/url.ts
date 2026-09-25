import { getPublicAttributeName } from './attr-names';

const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'sms', 'tel']);
const SCRIPT_URL_SCHEMES = new Set(['javascript', 'vbscript']);
const URL_SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

function urlScheme(value: string): string | undefined {
  // eslint-disable-next-line no-control-regex -- URL normalization intentionally removes ASCII and C1 controls.
  const compact = value.trim().replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  return URL_SCHEME_RE.exec(compact)?.[1]?.toLowerCase();
}

// Leading C0 controls and spaces are ignored by the URL parser too.
// eslint-disable-next-line no-control-regex -- matches what URL parsing ignores.
const EXPLICIT_HTTP_URL_RE = /^[\u0000-\u0020]*https?:/i;
const NAVIGATION_BASE = 'http://askr.invalid/';

/**
 * Resolve a navigation or redirect target against `base`. Only a target
 * written with an explicit `http:`/`https:` scheme may leave the base origin.
 * A path-like string that URL parsing resolves to another host
 * (`//evil.example`, `/\\evil.example`, `\\\\evil.example`) throws a
 * `TypeError`, so an app path can never become an open redirect. No window is
 * needed: the check holds for any base origin.
 */
export function resolveNavigationUrl(
  target: string,
  base: string = NAVIGATION_BASE
): URL {
  const url = new URL(target, base);
  if (
    url.origin !== new URL(base).origin &&
    !EXPLICIT_HTTP_URL_RE.test(target)
  ) {
    throw new TypeError(
      `Navigation target ${JSON.stringify(target)} resolves to another origin without an explicit http: or https: scheme.`
    );
  }
  return url;
}

/**
 * The public form of a navigation target: root-relative for the base origin,
 * absolute for an explicit URL on another origin.
 */
export function formatNavigationUrl(
  url: URL,
  base: string = NAVIGATION_BASE
): string {
  return url.origin === new URL(base).origin
    ? `${url.pathname}${url.search}${url.hash}`
    : url.href;
}

/**
 * Reject a scheme-less href (`/\\evil.example`, `//evil.example`) that the
 * browser would follow to another origin. Hrefs with a scheme are checked by
 * {@link isSafeHref}.
 */
export function assertPathHrefStaysOnOrigin(value: string): void {
  if (urlScheme(value) === undefined) resolveNavigationUrl(value);
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

/** Accepts the JSX prop name (`xlinkHref`) or the rendered attribute name. */
export function isUnsafeUrlAttribute(key: string, value: unknown): boolean {
  const name = getPublicAttributeName(key).toLowerCase();
  if (UNSAFE_URL_SCHEME_ATTRIBUTES.has(name)) return !isSafeHref(String(value));
  if (SCRIPT_URL_RESOURCE_ATTRIBUTES.has(name)) {
    return !isSafeResourceUrl(String(value));
  }
  return false;
}
