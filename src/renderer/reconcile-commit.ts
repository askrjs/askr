import { retireNodeSubtree } from './cleanup';
import { recordDOMReplace } from './utils';

export function commitReconciliation(
  parent: Element,
  finalNodes: Node[]
): void {
  try {
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
  } catch {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < finalNodes.length; i++) {
      fragment.appendChild(finalNodes[i]);
    }

    try {
      for (let n = parent.firstChild; n;) {
        const next = n.nextSibling;
        retireNodeSubtree(n);
        n = next;
      }
    } catch {
      // Ignore fallback cleanup failures.
    }

    recordDOMReplace('reconcile');
    parent.replaceChildren(fragment);
    return;
  }
}
