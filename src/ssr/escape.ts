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

const _TEXT_ESCAPE_RE = /[&<>]/g;

import { sanitizeCssValue } from '../common/style-sanitizer';

const STYLE_PROP_CACHE = new Map<string, string>();
const MAX_STYLE_PROP_CACHE_SIZE = 512;

// Pre-compute escape map functions for faster replacement
const _textEscapeMap = (ch: string): string => {
  const code = ch.charCodeAt(0);
  if (code === 38) return '&amp;'; // &
  if (code === 60) return '&lt;'; // <
  if (code === 62) return '&gt;'; // >
  return ch;
};

function toKebabCached(prop: string): string {
  const cached = STYLE_PROP_CACHE.get(prop);
  if (cached !== undefined) return cached;
  const kebab = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  if (STYLE_PROP_CACHE.size < MAX_STYLE_PROP_CACHE_SIZE) {
    STYLE_PROP_CACHE.set(prop, kebab);
  }
  return kebab;
}

/**
 * Clear the escape cache. Call between SSR requests in long-running servers
 * to prevent memory buildup from unique strings.
 */
export function clearEscapeCache(): void {
  escapeCache.clear();
}

/**
 * Fast check if a string needs text escaping.
 * Used to skip the full escape call when not needed.
 */
export function needsEscapeText(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 38 || ch === 60 || ch === 62) return true;
  }
  return false;
}

/**
 * Fast check if a string needs attribute escaping.
 * Checks for & " ' < > characters.
 */
export function needsEscapeAttr(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    // & " ' < >
    if (ch === 38 || ch === 34 || ch === 39 || ch === 60 || ch === 62) {
      return true;
    }
  }
  return false;
}

/**
 * Escape HTML special characters in text content
 * Fast-path: cache first, then scan-then-escape for new strings
 */
export function escapeText(text: string): string {
  // Only use cache for short strings (likely to be repeated)
  const useCache = text.length <= 64;

  if (useCache) {
    const cached = escapeCache.get(text);
    if (cached !== undefined) return cached;
  }

  // Fast path: check if escaping needed
  if (!needsEscapeText(text)) {
    if (useCache && escapeCache.size < MAX_CACHE_SIZE) {
      escapeCache.set(text, text);
    }
    return text;
  }

  // Single-pass scan-and-build: avoids 3 separate regex passes
  let escaped = '';
  let lastIndex = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    let entity: string;
    if (ch === 38) entity = '&amp;';
    else if (ch === 60) entity = '&lt;';
    else if (ch === 62) entity = '&gt;';
    else continue;
    escaped += text.slice(lastIndex, i) + entity;
    lastIndex = i + 1;
  }
  const result = escaped + text.slice(lastIndex);

  if (useCache && escapeCache.size < MAX_CACHE_SIZE) {
    escapeCache.set(text, result);
  }
  return result;
}

/**
 * Escape HTML special characters in attribute values.
 * Single-pass scan: returns the original string unchanged when no special
 * characters are found, so callers can drop separate needsEscapeAttr checks.
 */
export function escapeAttr(value: string): string {
  let escaped = '';
  let lastIndex = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    let entity: string;
    if (ch === 38) entity = '&amp;';
    else if (ch === 34) entity = '&quot;';
    else if (ch === 39) entity = '&#x27;';
    else if (ch === 60) entity = '&lt;';
    else if (ch === 62) entity = '&gt;';
    else continue;
    escaped += value.slice(lastIndex, i) + entity;
    lastIndex = i + 1;
  }
  // Return original reference when nothing needed escaping (no allocation)
  return lastIndex === 0 ? value : escaped + value.slice(lastIndex);
}

/**
 * Escape CSS value to prevent injection attacks.
 * Removes characters that could break out of CSS context.
 */
/**
 * Convert style object to CSS string with value escaping
 * Optimized to avoid Object.entries allocation
 */
export function styleObjToCss(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  const styleObj = value as Record<string, unknown>;
  let result = '';

  for (const k in styleObj) {
    const v = styleObj[k];
    if (v === null || v === undefined || v === false) continue;

    const prop = toKebabCached(k);
    const safeValue = sanitizeCssValue(v);
    if (safeValue) {
      result += `${prop}:${safeValue};`;
    }
  }

  return result || null;
}
