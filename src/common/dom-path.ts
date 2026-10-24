/** Hydration mismatch description: where it is, and what differed. */
export interface HydrationMismatchInfo {
  /** Selector-like path to the first differing node, e.g. `main > div:nth-child(2) > p`. */
  path: string;
  /** What the client expected at that position. */
  expected: string;
  /** What the server markup had there. */
  actual: string;
}

/**
 * A selector-like path from the children of `root` down to `node`. An element
 * with sibling elements carries `:nth-child(n)`; a text node is `#text`.
 */
export function domPath(node: Node, root: Node | null = null): string {
  const segments: string[] = [];
  for (
    let current: Node | null = node;
    current && current !== root && current.parentNode;
    current = current.parentNode
  ) {
    if (current.nodeType === 1) {
      const element = current as Element;
      const tag = element.localName;
      let position = 0;
      let total = 0;
      for (
        let sibling = element.parentNode!.firstChild;
        sibling;
        sibling = sibling.nextSibling
      ) {
        if (sibling.nodeType !== 1) continue;
        total++;
        if (sibling === element) position = total;
      }
      segments.push(total > 1 ? `${tag}:nth-child(${position})` : tag);
    } else if (current.nodeType === 3) {
      segments.push('#text');
    }
  }
  return segments.reverse().join(' > ');
}

const TEXT_LIMIT = 40;

/** `<tag>` for an element and `"text"` for a text node. */
export function describeNode(node: Node | null | undefined): string {
  if (!node) return 'nothing';
  if (node.nodeType === 1) return `<${(node as Element).localName}>`;
  if (node.nodeType === 3) return describeText((node as Text).data);
  return `#${node.nodeName.toLowerCase()}`;
}

export function describeText(data: string): string {
  const text =
    data.length > TEXT_LIMIT ? `${data.slice(0, TEXT_LIMIT)}...` : data;
  return `"${text}"`;
}

/** The message of a hydration mismatch error. */
export function formatHydrationMismatch(
  info: HydrationMismatchInfo,
  reason: string
): string {
  return `[Askr] Hydration mismatch detected at ${info.path || '(root)'}: expected ${info.expected} but found ${info.actual}. ${reason}`;
}
