/**
 * A root renders a value into a container element and owns everything it
 * renders.
 *
 * `prepare()` runs the render phase and returns work that is either
 * committed or discarded as a unit, so a caller updating several roots (a
 * navigation) can commit all of them or none. `render()` prepares and
 * commits in one step.
 */

import { clarifyRenderOverflow } from '../../common/render-depth';
import { reportUncaughtErrorLater } from '../../common/report-error';
import { Owner, getOwner, runWithOwner } from '../reactive/owner';
import { createRenderContext, domNodes, namespaceAt } from './nodes';
import { Pass } from './pass';
import { reconcileChildren } from './reconcile';
import { ROOT, collectDom, type RootNode } from './tree';
import { HydrationCursor, syncChildren } from './hydration';
import { EVENT_ROOT_CONTAINER, registerEventRoot } from './events';
import { installRenderUpdates } from './updates';

export interface PreparedRender {
  commit(): void;
  /** Drop the prepared work; returns cleanup failures of provisional owners. */
  discard(): unknown[];
  /** A failed DOM write undid this commit; the previous content remains. */
  readonly aborted: boolean;
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
  installRenderUpdates();
  const owner = new Owner(
    options.owner === undefined ? getOwner() : options.owner
  );
  (owner.context ??= new Map()).set(EVENT_ROOT_CONTAINER, container);
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
  let releaseEvents: (() => void) | null = null;

  function prepare(value: unknown): PreparedRender {
    const pass = new Pass();
    const fresh = !mounted;
    const tail = node.tail?.parentNode === container ? node.tail : null;
    const cursor = fresh && hydrate ? new HydrationCursor(tail) : null;
    const ctx = createRenderContext(
      pass,
      owner,
      namespaceAt(node),
      cursor ? { cursor, container } : null
    );
    try {
      runWithOwner(owner, () => {
        if (!fresh) {
          reconcileChildren(ctx, node, value, false);
          return;
        }
        const children = reconcileChildren(ctx, node, value, true);
        // Hosts that rendered before their portal content was written.
        for (const deferred of cursor?.deferred ?? []) deferred.render();
        const adopting = ctx.hydrate !== null;
        pass.op(() => {
          const before = node.tail?.parentNode === container ? node.tail : null;
          const dom = children.flatMap((child) => collectDom(child));
          if (adopting) {
            const previous = node.children;
            pass.onReversibleCommit(() => {
              node.children = previous;
            });
            syncChildren(pass, container, dom, before);
            node.children = children;
            return;
          }
          node.children = children;
          if (!before) {
            // A fresh root owns its container: it replaces what was there
            // (a loading placeholder, markup it is not hydrating).
            const replaced = Array.from(container.childNodes);
            pass.onReversibleCommit(() =>
              container.replaceChildren(...replaced)
            );
            container.replaceChildren(...dom);
            return;
          }
          for (const item of dom) container.insertBefore(item, before);
        });
      });
    } catch (error) {
      for (const failure of pass.discard()) reportUncaughtErrorLater(failure);
      throw clarifyRenderOverflow(error);
    }
    let settled = false;
    return {
      commit() {
        if (settled) return;
        settled = true;
        releaseEvents ??= registerEventRoot(container);
        try {
          pass.commit();
        } finally {
          // An aborted initial pass leaves the root fresh so the caller can
          // prepare again against the same empty or server-rendered DOM.
          if (!pass.commitAborted) {
            mounted = true;
            hydrate = false;
          }
        }
      },
      discard() {
        if (settled) return [];
        settled = true;
        return pass.discard();
      },
      get aborted() {
        return pass.commitAborted;
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
      releaseEvents?.();
      releaseEvents = null;
      return errors;
    },
  };
}
