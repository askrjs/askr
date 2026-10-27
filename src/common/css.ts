/**
 * Style object value policy.
 *
 * A style object value is rejected when it can load a resource or run code:
 * a URI scheme, a resource-loading function (`url()`, `image()`,
 * `image-set()`, `src()`, `element()`), or the legacy `expression()`.
 * Everything else is ordinary CSS and passes through. Braces and angle
 * brackets are removed so a value cannot close the declaration or the
 * attribute it is written into.
 *
 * CSS escapes (`\75 rl(`) are decoded before the check so they cannot smuggle
 * a blocked function past it, but the written value keeps its escapes, so
 * `content: "\201C"` renders the intended character.
 */

const CSS_UNSAFE_RE = /[{}<>]/g;
const CSS_URI_SCHEME_RE = /(?:^|[\s(,])([a-z][a-z0-9+.-]*):/i;
const CSS_FUNCTION_NAME_RE = /([a-z-][a-z0-9-]*)\s*\(/gi;
// A hex escape consumes one following whitespace; CSS preprocessing folds
// CRLF into one newline, so it consumes the pair.
const CSS_ESCAPE_RE = /\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\n\f\r])?|([\s\S]))/gi;

const CSS_BLOCKED_FUNCTIONS = new Set([
  'expression',
  'url',
  'src',
  'image',
  'image-set',
  '-webkit-image-set',
  'element',
  '-moz-element',
]);

function decodeCssEscapes(value: string): string {
  if (!value.includes('\\')) return value;
  return value.replace(CSS_ESCAPE_RE, (_match, hex: string, char: string) => {
    if (hex === undefined) return char;
    const code = Number.parseInt(hex, 16);
    return code === 0 || code > 0x10ffff
      ? '\uFFFD'
      : String.fromCodePoint(code);
  });
}

function blockedCssFunction(value: string): string | null {
  for (const match of value.matchAll(CSS_FUNCTION_NAME_RE)) {
    const name = match[1].toLowerCase();
    if (CSS_BLOCKED_FUNCTIONS.has(name)) return name;
  }
  return null;
}

/**
 * The style value to write, or `''` when the value is rejected. The written
 * form (braces and angle brackets removed) is what is checked, so a
 * character removed after the check cannot rebuild a blocked name.
 */
export function sanitizeCssValue(value: string): string {
  const str = String(value).replace(CSS_UNSAFE_RE, '');
  const decoded = decodeCssEscapes(str);
  if (CSS_URI_SCHEME_RE.test(decoded)) return '';
  if (decoded.includes('(') && blockedCssFunction(decoded) !== null) return '';
  return str;
}
