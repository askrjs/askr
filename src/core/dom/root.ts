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
  /** Apply reversible DOM operations while retaining rollback state. */
  apply(): void;
  /** Finalize an applied render and run refs and lifecycle work. */
  publish(): void;
  commit(): void;
  /** Undo applied operations and provisional render state. */
  rollback(): unknown[];
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
      pass.run(() =>
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
            const before =
              node.tail?.parentNode === container ? node.tail : null;
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
        })
      );
    } catch (error) {
      for (const failure of pass.discard()) reportUncaughtErrorLater(failure);
      throw clarifyRenderOverflow(error);
    }
    let settled = false;
    let phase: 'prepared' | 'applied' | 'published' | 'discarded' = 'prepared';
    let registeredEventsForPass = false;
    const apply = () => {
      if (settled || phase !== 'prepared') return;
      try {
        if (!releaseEvents) {
          releaseEvents = registerEventRoot(container);
          registeredEventsForPass = true;
        }
        pass.apply();
        phase = 'applied';
      } catch (error) {
        phase = 'discarded';
        settled = true;
        for (const failure of pass.discard()) {
          reportUncaughtErrorLater(failure);
        }
        if (registeredEventsForPass) {
          try {
            releaseEvents?.();
          } catch (cleanupError) {
            reportUncaughtErrorLater(cleanupError);
          }
          releaseEvents = null;
          registeredEventsForPass = false;
        }
        throw error;
      }
    };
    const publish = () => {
      if (settled) return;
      if (phase === 'prepared') apply();
      if (phase !== 'applied') {
        throw new Error('[Askr] Cannot publish a render that was not applied.');
      }
      settled = true;
      phase = 'published';
      try {
        pass.publish();
      } finally {
        mounted = true;
        hydrate = false;
      }
    };
    const rollback = () => {
      if (settled || phase === 'discarded') return [];
      settled = true;
      phase = 'discarded';
      const errors = pass.rollback();
      if (registeredEventsForPass) {
        try {
          releaseEvents?.();
        } catch (error) {
          errors.push(error);
        }
        releaseEvents = null;
        registeredEventsForPass = false;
      }
      return errors;
    };
    const discard = () => {
      if (settled || phase === 'discarded') return [];
      if (phase === 'applied') return rollback();
      settled = true;
      phase = 'discarded';
      return pass.discard();
    };
    return {
      apply,
      publish,
      commit() {
        apply();
        publish();
      },
      rollback,
      discard,
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
