const PUBLIC_ATTRIBUTE_NAME_MAP: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  fillRule: 'fill-rule',
  clipRule: 'clip-rule',
};

export function getPublicAttributeName(propName: string): string {
  return PUBLIC_ATTRIBUTE_NAME_MAP[propName] ?? propName;
}
