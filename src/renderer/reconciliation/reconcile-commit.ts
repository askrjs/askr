import { retireNodeSubtree } from '../ownership/cleanup';

/**
 * Move `parent`'s children into `finalNodes` order, retiring the rest.
 * Failures propagate to the owning update transaction, which rolls back the
 * DOM and routes the error to the nearest ErrorBoundary.
 */
export function commitReconciliation(
  parent: Element,
  finalNodes: Node[]
): void {
  const finalSet = new Set<Node>(finalNodes);

  for (let n = parent.firstChild; n;) {
    const next = n.nextSibling;
    if (!finalSet.has(n)) {
      retireNodeSubtree(n);
      parent.removeChild(n);
    }
    n = next;
  }

  for (let i = 0; i < finalNodes.length; i++) {
    const desiredNode = finalNodes[i];
    const anchor = parent.childNodes[i] ?? null;
    if (desiredNode !== anchor) {
      parent.insertBefore(desiredNode, anchor);
    }
  }
}
