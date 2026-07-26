const CSS_UNSAFE_RE = /[{}<>\\]/g;
const CSS_URI_SCHEME_RE = /(?:^|[\s(,])([a-z][a-z0-9+.-]*):/i;
const CSS_FUNCTION_NAME_RE = /([a-z-][a-z0-9-]*)\s*\(/gi;
const CSS_ALLOWED_FUNCTIONS = new Set([
  'var',
  'calc',
  'min',
  'max',
  'clamp',
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
  'translate',
  'translatex',
  'translatey',
  'translatez',
  'scale',
  'scalex',
  'scaley',
  'scalez',
  'rotate',
  'rotatex',
  'rotatey',
  'rotatez',
  'skew',
  'skewx',
  'skewy',
  'matrix',
  'matrix3d',
  'linear-gradient',
  'radial-gradient',
  'conic-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
  'repeating-conic-gradient',
  'cubic-bezier',
  'steps',
]);

/** Returns an inert string when a CSS value could inject a URL or expression. */
export function sanitizeCssValue(value: unknown): string {
  const str = String(value);
  if (CSS_URI_SCHEME_RE.test(str)) return '';
  if (str.includes('(')) {
    for (const match of str.matchAll(CSS_FUNCTION_NAME_RE)) {
      if (!CSS_ALLOWED_FUNCTIONS.has(match[1].toLowerCase())) return '';
    }
  }
  return str.replace(CSS_UNSAFE_RE, '');
}
