import type { Props } from '../common/props';
import { getRenderedAttributeValue } from './attrs';
import { getRawTextElement, type RawTextElement } from './escape';

/**
 * The parsing context an SSR element's children are written into.
 *
 * Whether `<script>` / `<style>` text is raw depends on how the browser's HTML
 * parser will read it: in HTML they are raw text elements, but inside SVG or
 * MathML (foreign content) they are ordinary elements whose text is parsed as
 * markup and must stay entity-escaped. This tracks the parser's view of the
 * tree, following the tree-construction dispatcher:
 *
 * - `html`: HTML content. `<svg>` and `<math>` enter foreign content.
 * - `svg` / `math`: foreign content.
 * - `math-annotation`: children of a non-HTML MathML `annotation-xml`, where an
 *   `<svg>` start tag creates an SVG element.
 * - `math-text`: children of a MathML text integration point (`mi`, `mo`,
 *   `mn`, `ms`, `mtext`), where start tags other than `mglyph` / `malignmark`
 *   are parsed as HTML.
 * - `select`: inside an HTML `select` (including its `option` / `optgroup`
 *   descendants), where the parser ignores a `<style>` start tag and reads its
 *   text as markup. `<script>` is still processed there, and `template`
 *   returns its content to `html`.
 * - `text`: inside an HTML element whose content the parser reads as text
 *   (raw text such as `noscript`, `iframe`, `xmp`, `noembed`, `noframes`,
 *   `style`, `script`; RCDATA `textarea`, `title`; or `plaintext`). Nothing
 *   written there becomes an element, and a nested `<script>` / `<style>` is
 *   not raw text: its content could close the ancestor, so it stays escaped.
 *
 * HTML integration points (SVG `foreignObject`, `desc`, `title`, and MathML
 * `annotation-xml` with an HTML `encoding`) return their children to `html`.
 *
 * The model errs towards foreign content: the parser's "breakout" of HTML tags
 * such as `<p>` out of foreign content is not modelled, so their raw text
 * children stay escaped (never emitted raw where the parser would read markup).
 */
export type SSRNamespace =
  | 'html'
  | 'svg'
  | 'math'
  | 'math-annotation'
  | 'math-text'
  | 'select'
  | 'text';

/** HTML elements whose content the parser reads as text, not markup. */
const TEXT_CONTENT_ELEMENTS = new Set([
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
  'script',
  'style',
  'textarea',
  'title',
  'xmp',
]);

/** The namespace an element with lower-case tag `tag` gets in `context`. */
export function getElementNamespace(
  context: SSRNamespace,
  tag: string
): 'html' | 'svg' | 'math' | 'text' {
  switch (context) {
    case 'text':
      return 'text';
    case 'svg':
      return 'svg';
    case 'math':
      return 'math';
    case 'math-annotation':
      return tag === 'svg' ? 'svg' : 'math';
    case 'math-text':
      if (tag === 'mglyph' || tag === 'malignmark') return 'math';
      break;
  }
  if (tag === 'svg') return 'svg';
  if (tag === 'math') return 'math';
  return 'html';
}

/**
 * The context the children of an element in `namespace`, itself written in
 * `context`, are parsed in.
 */
export function getChildNamespace(
  context: SSRNamespace,
  namespace: 'html' | 'svg' | 'math' | 'text',
  tag: string,
  props: Props | undefined
): SSRNamespace {
  if (namespace === 'text') return 'text';
  if (namespace === 'html') {
    if (TEXT_CONTENT_ELEMENTS.has(tag)) return 'text';
    if (tag === 'template') return 'html';
    return tag === 'select' || context === 'select' ? 'select' : 'html';
  }
  if (namespace === 'svg') {
    return tag === 'foreignobject' || tag === 'desc' || tag === 'title'
      ? 'html'
      : 'svg';
  }
  switch (tag) {
    case 'mi':
    case 'mo':
    case 'mn':
    case 'ms':
    case 'mtext':
      return 'math-text';
    case 'annotation-xml':
      return isHtmlAnnotationEncoding(
        getRenderedAttributeValue(props, 'encoding')
      )
        ? 'html'
        : 'math-annotation';
    default:
      return 'math';
  }
}

/**
 * Whether an element with lower-case tag `tag`, in `namespace` and written in
 * `context`, is parsed as an HTML raw text element whose text may be written
 * verbatim.
 */
export function getRawTextElementInContext(
  context: SSRNamespace,
  namespace: 'html' | 'svg' | 'math' | 'text',
  tag: string
): RawTextElement | null {
  if (namespace !== 'html') return null;
  const element = getRawTextElement(tag);
  return element === 'style' && context === 'select' ? null : element;
}

function isHtmlAnnotationEncoding(encoding: string | null): boolean {
  if (encoding === null) return false;
  const value = encoding.toLowerCase();
  return value === 'text/html' || value === 'application/xhtml+xml';
}
