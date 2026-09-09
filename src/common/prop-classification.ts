/**
 * The prop vocabulary shared by the DOM renderer and the SSR renderer.
 *
 * These questions — is this prop framework-internal, is it an ARIA attribute,
 * how is a style property named, does a `true` value render bare — were
 * previously answered separately on each side, and the answers had drifted.
 * Both renderers must agree for hydration to match, so the answers live here.
 */

/** Props that are never rendered as attributes by either renderer. */
export function isSkippedProp(key: string): boolean {
  return (
    key === 'children' ||
    key === 'imperativeChildren' ||
    key === 'key' ||
    key === 'ref'
  );
}

/**
 * ARIA state attributes take the strings `"true"`/`"false"`, so unlike HTML
 * boolean attributes a `false` value is meaningful and must still be rendered.
 */
export function isAriaAttribute(key: string): boolean {
  return key.length > 5 && key.slice(0, 5).toLowerCase() === 'aria-';
}

/**
 * CSS custom properties are case-sensitive and must survive verbatim; every
 * other style property is camelCase in JSX and kebab-case in CSS.
 */
export function normalizeStylePropertyName(propertyName: string): string {
  if (propertyName.startsWith('--')) {
    return propertyName;
  }

  return propertyName.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/**
 * HTML boolean content attributes: present means true, and the value is
 * ignored. A `true` prop renders these bare on both sides. Anything else —
 * `aria-*`, `data-*`, arbitrary attributes — renders the literal `"true"`,
 * because for those the value carries the meaning.
 */
const BOOLEAN_HTML_ATTRIBUTES = new Set(
  'allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected'.split(
    ' '
  )
);

/**
 * The attribute text for a prop value that is exactly `true`.
 *
 * Boolean attributes render bare (an empty value); everything else renders
 * `"true"` so ARIA state and `data-` payloads survive a round trip.
 */
export function booleanAttributeValue(attributeName: string): string {
  return BOOLEAN_HTML_ATTRIBUTES.has(attributeName.toLowerCase()) ? '' : 'true';
}
