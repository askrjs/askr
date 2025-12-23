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
  if (!str.includes('&') && !str.includes('<') && !str.includes('>')) {
    if (useCache && escapeCache.size < MAX_CACHE_SIZE) {
      escapeCache.set(text, str);
    }
    return str;
  }

  const result = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

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
  if (
    !str.includes('&') &&
    !str.includes('"') &&
    !str.includes("'") &&
    !str.includes('<') &&
    !str.includes('>')
  ) {
    return str;
  }

  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

  // Block dangerous CSS functions
  if (/(?:url|expression|javascript)\s*\(/i.test(str)) {
    return '';
  }

  // Remove characters that could break out of CSS value context
  return str.replace(/[{}<>\\]/g, '');
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
    const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    const safeValue = escapeCssValue(String(v));
    if (safeValue) {
      out += `${prop}:${safeValue};`;
    }
  }
  return out;
}
