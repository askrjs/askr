/**
 * HTML escaping utilities for SSR
 *
 * Centralizes text and attribute escaping to avoid duplication
 * between sync and streaming SSR renderers.
 */

// HTML5 void elements that don't have closing tags
export const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

// Escape cache for common values (bounded and clearable for long-running servers)
const escapeCache = new Map<string, string>();
const MAX_CACHE_SIZE = 256;

const TEXT_ESCAPE_TEST_RE = /[&<>]/;
const TEXT_ESCAPE_RE = /[&<>]/g;
const ATTR_ESCAPE_TEST_RE = /[&"'<>]/;
const ATTR_ESCAPE_RE = /[&"'<>]/g;

const CSS_UNSAFE_TEST_RE = /[{}<>\\]/;
const CSS_UNSAFE_RE = /[{}<>\\]/g;
const CSS_DANGEROUS_FN_RE = /(?:url|expression|javascript)\s*\(/i;

const STYLE_PROP_CACHE = new Map<string, string>();
const MAX_STYLE_PROP_CACHE_SIZE = 512;

function toKebabCached(prop: string): string {
  const cached = STYLE_PROP_CACHE.get(prop);
  if (cached !== undefined) return cached;
  const kebab = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  if (STYLE_PROP_CACHE.size < MAX_STYLE_PROP_CACHE_SIZE) {
    STYLE_PROP_CACHE.set(prop, kebab);
  }
  return kebab;
}

function mapTextEscape(ch: string): string {
  // '&' '<' '>'
  switch (ch) {
    case '&':
      return '&amp;';
    case '<':
      return '&lt;';
    default:
      return '&gt;';
  }
}

function mapAttrEscape(ch: string): string {
  // '&' '"' "'" '<' '>'
  switch (ch) {
    case '&':
      return '&amp;';
    case '"':
      return '&quot;';
    case "'":
      return '&#x27;';
    case '<':
      return '&lt;';
    default:
      return '&gt;';
  }
}

/**
 * Clear the escape cache. Call between SSR requests in long-running servers
 * to prevent memory buildup from unique strings.
 */
export function clearEscapeCache(): void {
  escapeCache.clear();
}

/**
 * Escape HTML special characters in text content (optimized with cache)
 */
export function escapeText(text: string): string {
  // Only use cache for short strings (likely to be repeated)
  const useCache = text.length <= 64;

  if (useCache) {
    const cached = escapeCache.get(text);
    if (cached !== undefined) return cached;
  }

  const str = String(text);
  // Fast path: check if escaping needed
  if (!TEXT_ESCAPE_TEST_RE.test(str)) {
    if (useCache && escapeCache.size < MAX_CACHE_SIZE) {
      escapeCache.set(text, str);
    }
    return str;
  }

  // Single-pass escape for strings that need escaping
  const result = str.replace(TEXT_ESCAPE_RE, mapTextEscape);

  if (useCache && escapeCache.size < MAX_CACHE_SIZE) {
    escapeCache.set(text, result);
  }
  return result;
}

/**
 * Escape HTML special characters in attribute values
 */
export function escapeAttr(value: string): string {
  const str = String(value);
  // Fast path: check if escaping needed
  if (!ATTR_ESCAPE_TEST_RE.test(str)) {
    return str;
  }

  // Single-pass escape for strings that need escaping
  return str.replace(ATTR_ESCAPE_RE, mapAttrEscape);
}

/**
 * Escape CSS value to prevent injection attacks.
 * Removes characters that could break out of CSS context.
 */
function escapeCssValue(value: string): string {
  // Remove or escape characters that could enable CSS injection:
  // - Semicolons (could end the property and start a new one)
  // - Curly braces (could break out of rule context)
  // - Angle brackets (could inject HTML in some contexts)
  // - Backslashes (CSS escape sequences)
  // - url() and expression() are common attack vectors
  const str = String(value);

  const hasUnsafeChars = CSS_UNSAFE_TEST_RE.test(str);
  const openParen = str.indexOf('(');

  // Fast path: most CSS values are simple (`10px`, `transparent`, etc.)
  // and should not pay regex costs.
  if (!hasUnsafeChars && openParen === -1) return str;

  // Block dangerous CSS functions only if the string can actually contain them.
  if (openParen !== -1 && CSS_DANGEROUS_FN_RE.test(str)) {
    return '';
  }

  // Remove characters that could break out of CSS value context
  return hasUnsafeChars ? str.replace(CSS_UNSAFE_RE, '') : str;
}

/**
 * Convert style object to CSS string with value escaping
 */
export function styleObjToCss(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '';
  // camelCase -> kebab-case
  let out = '';
  for (const [k, v] of entries) {
    if (v === null || v === undefined || v === false) continue;
    const prop = toKebabCached(k);
    const safeValue = escapeCssValue(String(v));
    if (safeValue) {
      out += `${prop}:${safeValue};`;
    }
  }
  return out;
}
