/**
 * A root renders a value into a container element and owns everything it
 * renders. Each `render()` is one pass: it either commits completely or
 * leaves the container as it was.
 */

import { reportUncaughtErrorLater } from '../../common/report-error';
import { Owner, getOwner, runWithOwner } from '../reactive/owner';
import { createRenderContext, domNodes, namespaceAt } from './nodes';
import { Pass } from './pass';
import { reconcileChildren } from './reconcile';
import { ROOT, collectDom, type RootNode } from './tree';
import './updates';

export interface Root {
  readonly node: RootNode;
  readonly owner: Owner;
  render(value: unknown): void;
  /** Remove the rendered content and end every lifetime it owns. */
  dispose(): unknown[];
}

export function createRoot(
  container: Element,
  options: { owner?: Owner | null; before?: Node | null } = {}
): Root {
  const owner = new Owner(options.owner ?? getOwner());
  const node: RootNode = {
    kind: ROOT,
    el: container,
    children: [],
    parent: null,
    key: undefined,
    tail: options.before ?? null,
  };
  let mounted = false;

  return {
    node,
    owner,
    render(value) {
      const pass = new Pass();
      const ctx = createRenderContext(pass, owner, namespaceAt(node));
      try {
        runWithOwner(owner, () => {
          if (mounted) {
            reconcileChildren(ctx, node, value, false);
            return;
          }
          const children = reconcileChildren(ctx, node, value, true);
          pass.op(() => {
            node.children = children;
            const before =
              node.tail?.parentNode === container ? node.tail : null;
            for (const child of children) {
              for (const dom of collectDom(child)) {
                container.insertBefore(dom, before);
              }
            }
          });
        });
      } catch (error) {
        for (const failure of pass.discard()) reportUncaughtErrorLater(failure);
        throw error;
      }
      mounted = true;
      pass.commit();
    },
    dispose() {
      const errors: unknown[] = [];
      for (const child of node.children) {
        for (const dom of collectDom(child)) dom.parentNode?.removeChild(dom);
        domNodes.release(child, errors);
      }
      node.children = [];
      owner.dispose(errors);
      return errors;
    },
  };
}
