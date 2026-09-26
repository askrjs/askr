/**
 * A root renders a value into a container element and owns everything it
 * renders.
 *
 * `prepare()` runs the render phase and returns work that is either
 * committed or discarded as a unit, so a caller updating several roots (a
 * navigation) can commit all of them or none. `render()` prepares and
 * commits in one step.
 */

import { reportUncaughtErrorLater } from '../../common/report-error';
import { Owner, getOwner, runWithOwner } from '../reactive/owner';
import { createRenderContext, domNodes, namespaceAt } from './nodes';
import { Pass } from './pass';
import { reconcileChildren } from './reconcile';
import { ROOT, collectDom, type RootNode } from './tree';
import { HydrationCursor, syncChildren } from './hydration';
import './updates';

export interface PreparedRender {
  commit(): void;
  /** Drop the prepared work; returns cleanup failures of provisional owners. */
  discard(): unknown[];
}

export interface Root {
  readonly node: RootNode;
  readonly owner: Owner;
  prepare(value: unknown): PreparedRender;
  render(value: unknown): void;
  /** Remove the rendered content and end every lifetime it owns. */
  dispose(): unknown[];
}

export interface RootOptions {
  /** Parent lifetime of the root's owner. */
  owner?: Owner | null;
  /** Existing child of the container that content is inserted before. */
  before?: Node | null;
  /** The first render adopts the container's server-rendered markup. */
  hydrate?: boolean;
}

export function createRoot(
  container: Element,
  options: RootOptions = {}
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
  let hydrate = options.hydrate === true;

  function prepare(value: unknown): PreparedRender {
    const pass = new Pass();
    const fresh = !mounted;
    const tail = node.tail?.parentNode === container ? node.tail : null;
    const ctx = createRenderContext(
      pass,
      owner,
      namespaceAt(node),
      fresh && hydrate ? { cursor: new HydrationCursor(tail), container } : null
    );
    try {
      runWithOwner(owner, () => {
        if (!fresh) {
          reconcileChildren(ctx, node, value, false);
          return;
        }
        const children = reconcileChildren(ctx, node, value, true);
        const adopting = ctx.hydrate !== null;
        pass.op(() => {
          node.children = children;
          const before = node.tail?.parentNode === container ? node.tail : null;
          const dom = children.flatMap((child) => collectDom(child));
          if (adopting) {
            syncChildren(container, dom, before);
            return;
          }
          for (const item of dom) container.insertBefore(item, before);
        });
      });
    } catch (error) {
      for (const failure of pass.discard()) reportUncaughtErrorLater(failure);
      throw error;
    }
    let settled = false;
    return {
      commit() {
        if (settled) return;
        settled = true;
        mounted = true;
        hydrate = false;
        pass.commit();
      },
      discard() {
        if (settled) return [];
        settled = true;
        return pass.discard();
      },
    };
  }

  return {
    node,
    owner,
    prepare,
    render(value) {
      prepare(value).commit();
    },
    dispose() {
      const errors: unknown[] = [];
      for (const child of node.children) {
        for (const dom of collectDom(child)) dom.parentNode?.removeChild(dom);
        domNodes.release(child, errors);
      }
      node.children = [];
      mounted = false;
      owner.dispose(errors);
      return errors;
    },
  };
}
