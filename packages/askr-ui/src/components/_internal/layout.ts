/**
 * Layout helpers shared by headless layout primitives.
 */

/** Units and patterns that identify a concrete CSS length value. */
const CSS_UNIT_RE =
  /^-?[\d.]+(%|px|em|rem|ex|ch|ic|lh|rlh|vw|vh|vmin|vmax|svw|svh|dvw|dvh|cqw|cqh|cqi|cqb|fr|cm|mm|in|pt|pc|Q)$/;

/**
 * Returns true when `value` is a concrete CSS length/size that can be applied
 * directly as an inline style – as opposed to a named design token like "sm".
 */
export function isCssLength(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v === '0') return true;
  if (CSS_UNIT_RE.test(v)) return true;
  // CSS functions: calc(), min(), max(), clamp(), fit-content(), env(), var() …
  if (/^[a-z][a-z-]*\(/.test(v)) return true;
  return false;
}

/**
 * Merges a record of computed layout styles with a user-supplied `style` prop.
 * The user's styles take precedence for conflicting keys.
 */
export function mergeLayoutStyles(
  layout: Record<string, string | number>,
  user: unknown
): string {
  const merged: Record<string, unknown> = { ...layout };

  if (user !== null && user !== undefined && typeof user === 'object') {
    Object.assign(merged, user as Record<string, unknown>);
  }

  const mergedString = objectToCssString(merged);

  if (typeof user === 'string' && user.trim()) {
    return mergedString ? `${mergedString};${user.trim()}` : user.trim();
  }

  return mergedString;
}

function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`);
}

function objectToCssString(styles: Record<string, unknown>): string {
  return Object.entries(styles)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${camelToKebab(key)}:${String(value)}`)
    .join(';');
}
