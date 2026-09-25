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
 * Enumerated attributes whose `"false"` state differs from being absent: an
 * `<img>` or link is draggable by default, and `spellcheck`/`contenteditable`
 * inherit when missing. `false` must render the literal string for these.
 */
const ENUMERATED_FALSE_ATTRIBUTES = new Set([
  'contenteditable',
  'draggable',
  'spellcheck',
  'writingsuggestions',
]);

/**
 * Whether a `false` prop renders as the string `"false"` rather than removing
 * the attribute: true for ARIA state and the enumerated attributes above.
 * Accepts either the JSX prop name or the rendered attribute name.
 */
export function keepsFalseValue(key: string): boolean {
  return (
    isAriaAttribute(key) || ENUMERATED_FALSE_ATTRIBUTES.has(key.toLowerCase())
  );
}

/**
 * CSS custom properties are case-sensitive and must survive verbatim; every
 * other style property is camelCase in JSX and kebab-case in CSS.
 */
export function normalizeStylePropertyName(propertyName: string): string {
  if (propertyName.startsWith('--')) {
    return propertyName;
  }

  const kebab = propertyName.replace(
    /[A-Z]/g,
    (char) => `-${char.toLowerCase()}`
  );
  // `ms` is the one vendor prefix written lowercase in JSX (`msFlexPositive`).
  return kebab.startsWith('ms-') ? `-${kebab}` : kebab;
}

/**
 * CSS properties (kebab-case, vendor prefix stripped) that accept a bare
 * number. This follows React's unitless list, plus `font-size-adjust`,
 * `initial-letter` and `math-depth`. Numeric values for every other property get a `px` unit, matching
 * the conventional JSX style contract.
 */
const UNITLESS_STYLE_PROPERTIES = new Set(
  'animation-iteration-count aspect-ratio border-image-outset border-image-slice border-image-width box-flex box-flex-group box-ordinal-group column-count columns fill-opacity flex flex-grow flex-negative flex-order flex-positive flex-shrink flood-opacity font-size-adjust font-weight grid-area grid-column grid-column-end grid-column-span grid-column-start grid-row grid-row-end grid-row-span grid-row-start initial-letter line-clamp line-height mask-border-outset mask-border-slice mask-border-width math-depth opacity order orphans scale shape-image-threshold stop-opacity stroke-dasharray stroke-dashoffset stroke-miterlimit stroke-opacity stroke-width tab-size widows z-index zoom'.split(
    ' '
  )
);

const VENDOR_PREFIX_RE = /^-(?:webkit|moz|ms|o)-/;

/**
 * The CSS text for one style entry, given its normalized property name.
 *
 * A non-zero number on a dimensional property gets `px` (`width: 10` is
 * `10px`); custom properties and unitless properties keep the bare number.
 */
export function styleValueText(propertyName: string, value: unknown): string {
  if (
    typeof value !== 'number' ||
    value === 0 ||
    !Number.isFinite(value) ||
    propertyName.startsWith('--') ||
    UNITLESS_STYLE_PROPERTIES.has(propertyName.replace(VENDOR_PREFIX_RE, ''))
  ) {
    return String(value);
  }
  return `${value}px`;
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
