import { getRendererDOMHost } from '../dom-host';
import { _reconcilerRecordedParents } from './keyed';
import { logger } from '../../common/logger';
import { isRuntimeEnvFlagEnabled } from '../env';
import { teardownNodeSubtree } from '../ownership/cleanup';
import { retireComponentOwnersForIntrinsicReuse } from '../component/host-cleanup';
import { recordBenchCounter, recordBenchEvent } from '../../runtime';
import { setDevValue, incDevCounter } from '../../runtime';
import { isRuntimeSchedulerExecuting } from '../../runtime';
import {
  canUseDirectReplaceChildrenSpread,
  getMaterializedKey,
  recordDOMReplace,
} from '../utils';
import type { KeyedVnode } from '../children/keyed-children';

declare const __ASKR_BENCH_BUILD__: boolean;
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;
const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

// Apply the "renderer" fast-path: build final node list reusing existing
// elements by key when possible, then perform a single atomic replaceChildren
// commit. Returns a new key map when the fast-path is applied, otherwise
// returns null (decided before any work) so the caller can use another path.
// Errors from user render code propagate; they never trigger a fallback.
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
  if (DEVELOPMENT_BUILD_ENABLED && !isRuntimeSchedulerExecuting()) {
    logger.warn(
      '[Askr][FASTPATH][DEV] Fast-path reconciliation invoked outside scheduler execution'
    );
  }

  // Choose lookup strategy depending on size (linear scan for small lists)
  let parentChildrenArr: Element[] | undefined;
  let localOldKeyMap: Map<string | number, Element> | undefined;

  if (totalKeyed <= 20) {
    // Small lists: use array scan (faster than Map overhead for ≤20 items)
    parentChildrenArr = Array.from(
      parent.children,
      (child) => child as Element
    );
  } else if (!oldKeyMap || oldKeyMap.size === 0) {
    // Medium/large lists without existing key map: build from DOM
    localOldKeyMap = new Map<string | number, Element>();
    for (let ch = parent.firstElementChild; ch; ch = ch.nextElementSibling) {
      const key = getMaterializedKey(ch);
      if (key !== undefined) {
        localOldKeyMap.set(key, ch);
      }
    }
  }
  // else: reuse oldKeyMap directly (most common case for repeat renders)

  const finalNodes: Node[] = [];
  const newKeyMap = new Map<string | number, Element>();
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
      getRendererDOMHost().updateElementFromVnode(el, vnode);
      retireComponentOwnersForIntrinsicReuse(el);
      finalNodes.push(el);
      newKeyMap.set(key, el);
      reusedCount++;
    } else {
      const newEl = getRendererDOMHost().createDOMNode(vnode);
      if (newEl) {
        finalNodes.push(newEl);
        if (newEl instanceof Element) newKeyMap.set(key, newEl);
        createdNodes++;
      }
    }
  }

  // Atomic commit
  const tCommitStart = Date.now();
  const fragmentAppendCount = finalNodes.length;
  const useDirectReplace = canUseDirectReplaceChildrenSpread(finalNodes.length);
  const finalNodeSet = useDirectReplace ? new Set<Node>(finalNodes) : null;
  const fragment = useDirectReplace
    ? null
    : parent.ownerDocument.createDocumentFragment();

  if (fragment) {
    for (let i = 0; i < finalNodes.length; i++) {
      fragment.appendChild(finalNodes[i]);
    }
  }

  // Pre-cleanup: keep reused nodes alive, but clean up anything still
  // attached to the parent that will be removed by replaceChildren.
  for (let n = parent.firstChild; n;) {
    const next = n.nextSibling;
    if (finalNodeSet?.has(n)) {
      n = next;
      continue;
    }
    // One teardown per removed node, so its failures form a single report.
    teardownNodeSubtree(n);
    n = next;
  }

  recordDOMReplace('FASTPATH');

  if (useDirectReplace) {
    // Move-only reorder commits already have the final node set, so small
    // lists can write it directly without a fragment round-trip.
    parent.replaceChildren(...finalNodes);
  } else {
    parent.replaceChildren(fragment!);
  }
  if (BENCH_BUILD_ENABLED) {
    recordBenchEvent('domMove', reusedCount);
    recordBenchEvent('domInsert', createdNodes);
    recordBenchCounter('replaceChildrenCommits');
  }

  // Record that we performed exactly one DOM commit.
  setDevValue('__LAST_FASTPATH_COMMIT_COUNT', 1);

  // Dev tracing
  if (DEVELOPMENT_BUILD_ENABLED) {
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
    setDevValue('__LAST_FASTPATH_STATS', stats);
    setDevValue('__LAST_FASTPATH_REUSED', reusedCount > 0);
    incDevCounter('fastpathHistoryPush');
    if (isRuntimeEnvFlagEnabled('ASKR_FASTPATH_DEBUG')) {
      logger.warn(
        '[Askr][FASTPATH]',
        JSON.stringify({ n: totalKeyed, createdNodes, reusedCount })
      );
    }
  }

  // Record that reconciler recorded stats for this parent in this pass
  _reconcilerRecordedParents.add(parent);

  return newKeyMap;
}
