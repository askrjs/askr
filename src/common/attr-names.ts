/**
 * JSX prop name to rendered attribute name, shared by the DOM renderer and SSR.
 *
 * The DOM renderer additionally lowercases the result for non-SVG elements,
 * using the element's real namespace. SSR renders to text and has no element to
 * ask, so every camelCase prop that does not name a real camelCase attribute is
 * mapped explicitly here — otherwise SSR emits `tabIndex` where the DOM renderer
 * writes `tabindex`, or `strokeDasharray`, which browsers ignore. Every mapped
 * name is lowercase in both HTML and SVG, so the mapping is
 * namespace-independent. SVG attributes that really are camelCase (`viewBox`,
 * `gradientUnits`, `preserveAspectRatio`, ...) are not listed and pass through.
 *
 * Custom elements (a tag name containing `-`) define their own attributes, so
 * they only get this base table and never the SVG table below.
 */
const PUBLIC_ATTRIBUTE_NAME_MAP: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  autoComplete: 'autocomplete',
  colSpan: 'colspan',
  contentEditable: 'contenteditable',
  enterKeyHint: 'enterkeyhint',
  inputMode: 'inputmode',
  maxLength: 'maxlength',
  minLength: 'minlength',
  noValidate: 'novalidate',
  readOnly: 'readonly',
  rowSpan: 'rowspan',
  spellCheck: 'spellcheck',
  tabIndex: 'tabindex',
  writingSuggestions: 'writingsuggestions',
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  fillRule: 'fill-rule',
  clipRule: 'clip-rule',
};

const SVG_ATTRIBUTE_NAME_MAP: Record<string, string> = {};

/**
 * SVG presentation attributes are hyphenated, and the XML-namespaced ones use
 * a prefix; JSX spells both in camelCase (`strokeDasharray`, `xlinkHref`).
 * Listing the rendered names and deriving the prop names keeps this table
 * small in the client bundle.
 */
for (const attributeName of 'alignment-baseline baseline-shift clip-path clip-rule color-interpolation color-interpolation-filters color-rendering dominant-baseline fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight image-rendering letter-spacing lighting-color marker-end marker-mid marker-start mask-type paint-order pointer-events shape-rendering stop-color stop-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-overflow text-rendering transform-origin unicode-bidi vector-effect white-space word-spacing writing-mode xlink:actuate xlink:arcrole xlink:href xlink:role xlink:show xlink:title xlink:type xml:base xml:lang xml:space xmlns:xlink'.split(
  ' '
)) {
  SVG_ATTRIBUTE_NAME_MAP[
    attributeName.replace(/[-:]([a-z])/g, (_, char: string) =>
      char.toUpperCase()
    )
  ] = attributeName;
}

export function isCustomElementName(tagName: string): boolean {
  return tagName.includes('-');
}

export function getPublicAttributeName(
  propName: string,
  customElement = false
): string {
  // `attr:name` is the explicit attribute escape hatch: the name is used as
  // written, never mapped and never routed to a DOM property.
  if (propName.startsWith('attr:')) return propName.slice(5);
  return (
    PUBLIC_ATTRIBUTE_NAME_MAP[propName] ??
    (customElement ? undefined : SVG_ATTRIBUTE_NAME_MAP[propName]) ??
    propName
  );
}

const ATTRIBUTE_PREFIX_NAMESPACES: Record<string, string> = {
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xmlns: 'http://www.w3.org/2000/xmlns/',
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';

/**
 * The XML namespace of a prefixed attribute name such as `xlink:href` on an
 * element in `elementNamespace`, or `null` for ordinary attributes. The HTML
 * parser puts these attributes in their namespaces only on SVG and MathML
 * elements when it reads SSR markup; on HTML elements `xml:lang` stays a plain
 * attribute. The DOM renderer must do the same so both sides produce the same
 * element.
 */
export function attributeNamespace(
  elementNamespace: string | null,
  attributeName: string
): string | null {
  if (
    elementNamespace !== SVG_NAMESPACE &&
    elementNamespace !== MATHML_NAMESPACE
  ) {
    return null;
  }
  const colon = attributeName.indexOf(':');
  if (colon === -1) return null;
  return ATTRIBUTE_PREFIX_NAMESPACES[attributeName.slice(0, colon)] ?? null;
}
