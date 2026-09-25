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
};

/**
 * SVG presentation attributes are hyphenated, and the XML-namespaced ones use
 * a prefix; JSX spells both in camelCase (`strokeDasharray`, `xlinkHref`).
 * Listing the rendered names and deriving the prop names keeps this table
 * small in the client bundle.
 */
for (const attributeName of 'alignment-baseline baseline-shift clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-orientation-horizontal glyph-orientation-vertical image-rendering letter-spacing lighting-color marker-end marker-mid marker-start paint-order pointer-events shape-rendering stop-color stop-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering transform-origin unicode-bidi vector-effect word-spacing writing-mode xlink:actuate xlink:arcrole xlink:href xlink:role xlink:show xlink:title xlink:type xml:base xml:lang xml:space xmlns:xlink'.split(
  ' '
)) {
  PUBLIC_ATTRIBUTE_NAME_MAP[
    attributeName.replace(/[-:]([a-z])/g, (_, char: string) =>
      char.toUpperCase()
    )
  ] = attributeName;
}

export function getPublicAttributeName(propName: string): string {
  return PUBLIC_ATTRIBUTE_NAME_MAP[propName] ?? propName;
}

const ATTRIBUTE_PREFIX_NAMESPACES: Record<string, string> = {
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xmlns: 'http://www.w3.org/2000/xmlns/',
};

/**
 * The XML namespace of a prefixed attribute name such as `xlink:href`, or
 * `null` for ordinary attributes. The HTML parser puts these attributes in
 * their namespaces when it reads SSR markup, so the DOM renderer must write
 * them with `setAttributeNS` for the two sides to produce the same element.
 */
export function attributeNamespace(attributeName: string): string | null {
  const colon = attributeName.indexOf(':');
  if (colon === -1) return null;
  return ATTRIBUTE_PREFIX_NAMESPACES[attributeName.slice(0, colon)] ?? null;
}
