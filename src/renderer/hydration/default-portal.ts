import { getUnwrittenDefaultPortalHosts } from '../../common/default-portal-runtime';
import { isSSRPortalWriterAnchor } from '../../common/portal';
import type { ComponentInstance } from '../../runtime';
import { getOwnedRange } from '../ownership/ranges';

/** Revisit server portal content once active hydration writers have settled. */
export function finalizeDefaultPortalHydration(root: Element): void {
  for (const deferred of root.querySelectorAll('[data-skip-hydrate]')) {
    const walker = root.ownerDocument.createTreeWalker(
      deferred,
      NodeFilter.SHOW_COMMENT
    );
    while (walker.nextNode()) {
      if (isSSRPortalWriterAnchor(walker.currentNode)) return;
    }
  }

  for (const candidate of getUnwrittenDefaultPortalHosts()) {
    const host = candidate as ComponentInstance;
    const node = host.target ?? host._placeholder;
    if (!node || !root.contains(node) || !host.owner.mounted) continue;
    const range = getOwnedRange(host);
    const hasOutput =
      host.target instanceof Element ||
      Boolean(range && !range.single && range.start.nextSibling !== range.end);
    if (hasOutput) host.notifyUpdate?.();
  }
}
