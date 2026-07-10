import { createDOMNode, updateElementFromVnode } from './dom';
import { _reconcilerRecordedParents } from './keyed';
import { logger } from '../common/logger';
import { getRuntimeEnv } from './env';
import { cleanupInstanceIfPresent, removeAllListeners } from './cleanup';
import { recordBenchCounter, recordBenchEvent } from '../runtime';
import { setDevValue, incDevCounter } from '../runtime';
import { isRuntimeSchedulerExecuting } from '../runtime';
import { isBulkCommitActive, markFastPathApplied } from '../runtime';
import { canUseDirectReplaceChildrenSpread, getMaterializedKey } from './utils';
import type { KeyedVnode } from './keyed-children';

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

// Apply the "renderer" fast-path: build final node list reusing existing
// elements by key when possible, then perform a single atomic replaceChildren
// commit. Returns a new key map when the fast-path is applied, otherwise
// returns null to indicate the caller should continue with fallback paths.
export function applyRendererFastPath(
  parent: Element,
  keyedVnodes: KeyedVnode[],
  oldKeyMap?: Map<string | number, Element>
): Map<string | number, Element> | null {
  // SSR guard: fast-path is DOM-specific
  if (typeof document === 'undefined') return null;

  const totalKeyed = keyedVnodes.length;
  if (totalKeyed === 0) return null;

  // Dev invariant: ensure we are executing inside the scheduler/commit flush
  if (!isRuntimeSchedulerExecuting()) {
    logger.warn(
      '[Askr][FASTPATH][DEV] Fast-path reconciliation invoked outside scheduler execution'
    );
  }

  // Choose lookup strategy depending on size (linear scan for small lists)
  let parentChildrenArr: Element[] | undefined;
  let localOldKeyMap: Map<string | number, Element> | undefined;

  if (totalKeyed <= 20) {
    // Small lists: use array scan (faster than Map overhead for ≤20 items)
    try {
      parentChildrenArr = Array.from(
        parent.children,
        (child) => child as Element
      );
    } catch (e) {
      parentChildrenArr = undefined;
      void e;
    }
  } else if (!oldKeyMap || oldKeyMap.size === 0) {
    // Medium/large lists without existing key map: build from DOM
    localOldKeyMap = new Map<string | number, Element>();
    try {
      for (let ch = parent.firstElementChild; ch; ch = ch.nextElementSibling) {
        const key = getMaterializedKey(ch);
        if (key !== undefined) {
          localOldKeyMap.set(key, ch);
        }
      }
    } catch (e) {
      localOldKeyMap = undefined;
      void e;
    }
  }
  // else: reuse oldKeyMap directly (most common case for repeat renders)

  const finalNodes: Node[] = [];
  let mapLookups = 0;
  let createdNodes = 0;
  let reusedCount = 0;

  for (let i = 0; i < keyedVnodes.length; i++) {
    const { key, vnode } = keyedVnodes[i];
    mapLookups++;

    let el: Element | undefined;
    if (totalKeyed <= 20 && parentChildrenArr) {
      for (let j = 0; j < parentChildrenArr.length; j++) {
        const ch = parentChildrenArr[j];
        if (getMaterializedKey(ch) === key) {
          el = ch;
          break;
        }
      }
      if (!el) el = oldKeyMap?.get(key);
    } else {
      el = localOldKeyMap?.get(key as string | number) ?? oldKeyMap?.get(key);
    }

    if (el) {
      updateElementFromVnode(el, vnode);
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

  // Atomic commit
  try {
    const tCommitStart = Date.now();
    const fragmentAppendCount = finalNodes.length;
    const useDirectReplace = canUseDirectReplaceChildrenSpread(
      finalNodes.length
    );
    const finalNodeSet = useDirectReplace ? new Set<Node>(finalNodes) : null;
    const fragment = useDirectReplace
      ? null
      : parent.ownerDocument.createDocumentFragment();

    if (fragment) {
      for (let i = 0; i < finalNodes.length; i++) {
        fragment.appendChild(finalNodes[i]);
      }
    }

    // Pre-cleanup: remove component instances that will be removed by replaceChildren
    try {
      // Keep reused nodes alive, but clean up anything still attached to the
      // parent that will be removed by replaceChildren.
      for (let n = parent.firstChild; n; ) {
        const next = n.nextSibling;
        if (finalNodeSet?.has(n)) {
          n = next;
          continue;
        }
        if (n instanceof Element) removeAllListeners(n);
        cleanupInstanceIfPresent(n);
        n = next;
      }
    } catch (e) {
      void e;
    }

    try {
      incDevCounter('__DOM_REPLACE_COUNT');
      setDevValue('__LAST_DOM_REPLACE_STACK_FASTPATH', new Error().stack);
    } catch (e) {
      void e;
    }

    if (useDirectReplace) {
      // Move-only reorder commits already have the final node set, so small
      // lists can write it directly without a fragment round-trip.
      parent.replaceChildren(...finalNodes);
    } else {
      parent.replaceChildren(fragment!);
    }
    recordBenchEvent('domMove', reusedCount);
    recordBenchEvent('domInsert', createdNodes);
    recordBenchCounter('replaceChildrenCommits');

    // Record that we performed exactly one DOM commit.
    try {
      setDevValue('__LAST_FASTPATH_COMMIT_COUNT', 1);
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
        t_fragment: Date.now() - tCommitStart,
        t_commit: 0,
        t_bookkeeping: 0,
        fragmentAppendCount,
        mapLookups,
        createdNodes,
        reusedCount,
      } as const;
      if (typeof globalThis !== 'undefined') {
        setDevValue('__LAST_FASTPATH_STATS', stats);
        setDevValue('__LAST_FASTPATH_REUSED', reusedCount > 0);
        incDevCounter('fastpathHistoryPush');
      }
      const env = getRuntimeEnv();
      if (
        env.ASKR_FASTPATH_DEBUG === '1' ||
        env.ASKR_FASTPATH_DEBUG === 'true'
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
