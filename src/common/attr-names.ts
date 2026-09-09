/**
 * JSX prop name to rendered HTML attribute name.
 *
 * The DOM renderer additionally lowercases the result for non-SVG elements,
 * using the element's real namespace. SSR renders to text and has no element to
 * ask, so every camelCase attribute the public prop types declare is mapped
 * explicitly here — otherwise SSR emits `tabIndex` where the DOM renderer
 * writes `tabindex`. All of the entries below are HTML-only attribute names
 * that are lowercase in SVG too, so the mapping is namespace-independent.
 */
const PUBLIC_ATTRIBUTE_NAME_MAP: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  fillRule: 'fill-rule',
  clipRule: 'clip-rule',
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

export function getPublicAttributeName(propName: string): string {
  return PUBLIC_ATTRIBUTE_NAME_MAP[propName] ?? propName;
}
