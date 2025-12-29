import type { VNode } from './types';
import { createDOMNode } from './dom';
import { _reconcilerRecordedParents } from './keyed';
import { logger } from '../dev/logger';
import { cleanupInstanceIfPresent, removeAllListeners } from './cleanup';
import { __ASKR_set, __ASKR_incCounter } from './diag';
import { isSchedulerExecuting } from '../runtime/scheduler';
import { isBulkCommitActive, markFastPathApplied } from '../runtime/fastlane';

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

// Apply the "renderer" fast-path: build final node list reusing existing
// elements by key when possible, then perform a single atomic replaceChildren
// commit. Returns a new key map when the fast-path is applied, otherwise
// returns null to indicate the caller should continue with fallback paths.
export function applyRendererFastPath(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>,
  oldKeyMap?: Map<string | number, Element>,
  unkeyedVnodes?: VNode[]
): Map<string | number, Element> | null {
  // SSR guard: fast-path is DOM-specific
  if (typeof document === 'undefined') return null;

  const totalKeyed = keyedVnodes.length;
  if (totalKeyed === 0 && (!unkeyedVnodes || unkeyedVnodes.length === 0))
    return null;

  // Dev invariant: ensure we are executing inside the scheduler/commit flush
  if (!isSchedulerExecuting()) {
    logger.warn(
      '[Askr][FASTPATH][DEV] Fast-path reconciliation invoked outside scheduler execution'
    );
  }

  // Choose lookup strategy depending on size (linear scan for small lists)
  let parentChildrenArr: Element[] | undefined;
  let localOldKeyMap: Map<string | number, Element> | undefined;

  if (totalKeyed <= 20) {
    try {
      const pc = parent.children;
      parentChildrenArr = new Array(pc.length);
      for (let i = 0; i < pc.length; i++)
        parentChildrenArr[i] = pc[i] as Element;
    } catch (e) {
      parentChildrenArr = undefined;
      void e;
    }
  } else {
    localOldKeyMap = new Map<string | number, Element>();
    try {
      const parentChildren = Array.from(parent.children);
      for (let i = 0; i < parentChildren.length; i++) {
        const ch = parentChildren[i] as Element;
        const k = ch.getAttribute('data-key');
        if (k !== null) {
          localOldKeyMap.set(k, ch);
          const n = Number(k);
          if (!Number.isNaN(n)) localOldKeyMap.set(n, ch);
        }
      }
    } catch (e) {
      localOldKeyMap = undefined;
      void e;
    }
  }

  const finalNodes: Node[] = [];
  let mapLookups = 0;
  let createdNodes = 0;
  let reusedCount = 0;

  for (let i = 0; i < keyedVnodes.length; i++) {
    const { key, vnode } = keyedVnodes[i];
    mapLookups++;

    let el: Element | undefined;
    if (totalKeyed <= 20 && parentChildrenArr) {
      const ks = String(key);
      for (let j = 0; j < parentChildrenArr.length; j++) {
        const ch = parentChildrenArr[j];
        const k = ch.getAttribute('data-key');
        if (k !== null && (k === ks || Number(k) === (key as number))) {
          el = ch;
          break;
        }
      }
      if (!el) el = oldKeyMap?.get(key);
    } else {
      el = localOldKeyMap?.get(key as string | number) ?? oldKeyMap?.get(key);
    }

    if (el) {
      finalNodes.push(el);
      reusedCount++;
    } else {
      const newEl = createDOMNode(vnode);
      if (newEl) {
        finalNodes.push(newEl);
        createdNodes++;
      }
    }
  }

  // Add unkeyed nodes (detached as well)
  if (unkeyedVnodes && unkeyedVnodes.length) {
    for (const vnode of unkeyedVnodes) {
      const newEl = createDOMNode(vnode);
      if (newEl) {
        finalNodes.push(newEl);
        createdNodes++;
      }
    }
  }

  // Atomic commit
  try {
    const tFragmentStart = Date.now();
    const fragment = document.createDocumentFragment();
    let fragmentAppendCount = 0;
    for (let i = 0; i < finalNodes.length; i++) {
      fragment.appendChild(finalNodes[i]);
      fragmentAppendCount++;
    }

    // Pre-cleanup: remove component instances that will be removed by replaceChildren
    try {
      const existing = Array.from(parent.childNodes);
      // Only cleanup nodes that are *not* part of the finalNodes list so we don't
      // remove listeners from elements we're reusing (critical invariant)
      const toRemove = existing.filter((n) => !finalNodes.includes(n));
      for (const n of toRemove) {
        if (n instanceof Element) removeAllListeners(n);
        cleanupInstanceIfPresent(n);
      }
    } catch (e) {
      void e;
    }

    try {
      __ASKR_incCounter('__DOM_REPLACE_COUNT');
      __ASKR_set('__LAST_DOM_REPLACE_STACK_FASTPATH', new Error().stack);
    } catch (e) {
      void e;
    }

    parent.replaceChildren(fragment);

    // Record that we performed exactly one DOM commit.
    try {
      __ASKR_set('__LAST_FASTPATH_COMMIT_COUNT', 1);
    } catch (e) {
      void e;
    }

    // If a runtime bulk commit is active, mark this parent as fast-path applied.
    try {
      if (isBulkCommitActive()) markFastPathApplied(parent);
    } catch (e) {
      void e;
    }

    // Phase: bookkeeping - populate newKeyMap
    const newKeyMap = new Map<string | number, Element>();
    for (let i = 0; i < keyedVnodes.length; i++) {
      const key = keyedVnodes[i].key;
      const node = finalNodes[i];
      if (node instanceof Element) newKeyMap.set(key, node as Element);
    }

    // Dev tracing
    try {
      const stats = {
        n: totalKeyed,
        moves: 0,
        lisLen: 0,
        t_lookup: 0,
        t_fragment: Date.now() - tFragmentStart,
        t_commit: 0,
        t_bookkeeping: 0,
        fragmentAppendCount,
        mapLookups,
        createdNodes,
        reusedCount,
      } as const;
      if (typeof globalThis !== 'undefined') {
        __ASKR_set('__LAST_FASTPATH_STATS', stats);
        __ASKR_set('__LAST_FASTPATH_REUSED', reusedCount > 0);
        __ASKR_incCounter('fastpathHistoryPush');
      }
      if (
        process.env.ASKR_FASTPATH_DEBUG === '1' ||
        process.env.ASKR_FASTPATH_DEBUG === 'true'
      ) {
        logger.warn(
          '[Askr][FASTPATH]',
          JSON.stringify({ n: totalKeyed, createdNodes, reusedCount })
        );
      }
    } catch (e) {
      void e;
    }

    // Record that reconciler recorded stats for this parent in this pass
    try {
      _reconcilerRecordedParents.add(parent);
    } catch (e) {
      void e;
    }

    return newKeyMap;
  } catch (e) {
    void e;
    return null;
  }
}
