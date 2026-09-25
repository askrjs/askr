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
  | 'math-text';

/** The namespace an element with lower-case tag `tag` gets in `context`. */
export function getElementNamespace(
  context: SSRNamespace,
  tag: string
): 'html' | 'svg' | 'math' {
  switch (context) {
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

/** The context the children of an element in `namespace` are parsed in. */
export function getChildNamespace(
  namespace: 'html' | 'svg' | 'math',
  tag: string,
  props: Record<string, unknown> | null | undefined
): SSRNamespace {
  if (namespace === 'html') return 'html';
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
      return isHtmlAnnotationEncoding(props?.encoding)
        ? 'html'
        : 'math-annotation';
    default:
      return 'math';
  }
}

function isHtmlAnnotationEncoding(encoding: unknown): boolean {
  if (typeof encoding !== 'string') return false;
  const value = encoding.toLowerCase();
  return value === 'text/html' || value === 'application/xhtml+xml';
}
