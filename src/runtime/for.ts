/**
 * For primitive runtime
 *
 * Manages per-item component instances and array reconciliation
 * to eliminate over-invalidation in list rendering.
 */

import { type State } from './state';
import {
  type ComponentInstance,
  createComponentInstance,
  getCurrentInstance,
  setCurrentComponentInstance,
  finalizeReadSubscriptions,
  getCurrentStateIndex,
  setStateIndex,
  cleanupComponent,
} from './component';
import type { DOMElement, VNode } from '../common/vnode';
import type { ComponentFunction } from '../common/component';
import { ELEMENT_TYPE, type JSXElement } from '../common/jsx';
import type { Props } from '../common/props';
import {
  removeAllListeners,
  cleanupInstanceIfPresent,
} from '../renderer/cleanup';

const askrGlobal = globalThis as typeof globalThis & {
  __ASKR_BENCH__?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Bench Instrumentation (gate behind globalThis.__ASKR_BENCH__)
// ─────────────────────────────────────────────────────────────────────────────

interface BenchMetrics {
  itemsCreated: number;
  itemsReused: number;
  itemsRemoved: number;
  itemsMoved: number;
  rowFactoryInvocations: number;
  keyLookups: number;
  keyHits: number;
  keyMisses: number;
  domInserts: number;
  domRemoves: number;
  domMoves: number;
  domAttrSets: number;
  domTextSets: number;
  reconcilePhaseMs: number;
  domCommitPhaseMs: number;
  fastLaneName: string | null;
}

const benchMetrics: BenchMetrics = {
  itemsCreated: 0,
  itemsReused: 0,
  itemsRemoved: 0,
  itemsMoved: 0,
  rowFactoryInvocations: 0,
  keyLookups: 0,
  keyHits: 0,
  keyMisses: 0,
  domInserts: 0,
  domRemoves: 0,
  domMoves: 0,
  domAttrSets: 0,
  domTextSets: 0,
  reconcilePhaseMs: 0,
  domCommitPhaseMs: 0,
  fastLaneName: null,
};

function resetBenchMetrics() {
  if (!askrGlobal.__ASKR_BENCH__) return;
  benchMetrics.itemsCreated = 0;
  benchMetrics.itemsReused = 0;
  benchMetrics.itemsRemoved = 0;
  benchMetrics.itemsMoved = 0;
  benchMetrics.rowFactoryInvocations = 0;
  benchMetrics.keyLookups = 0;
  benchMetrics.keyHits = 0;
  benchMetrics.keyMisses = 0;
  benchMetrics.domInserts = 0;
  benchMetrics.domRemoves = 0;
  benchMetrics.domMoves = 0;
  benchMetrics.domAttrSets = 0;
  benchMetrics.domTextSets = 0;
  benchMetrics.reconcilePhaseMs = 0;
  benchMetrics.domCommitPhaseMs = 0;
  benchMetrics.fastLaneName = null;
}

function recordBenchEvent(
  event:
    | 'itemCreated'
    | 'itemReused'
    | 'itemRemoved'
    | 'itemMoved'
    | 'rowFactory'
    | 'keyLookup'
    | 'keyHit'
    | 'keyMiss'
    | 'domInsert'
    | 'domRemove'
    | 'domMove'
    | 'domAttrSet'
    | 'domTextSet'
) {
  if (!askrGlobal.__ASKR_BENCH__) return;
  switch (event) {
    case 'itemCreated':
      benchMetrics.itemsCreated++;
      break;
    case 'itemReused':
      benchMetrics.itemsReused++;
      break;
    case 'itemRemoved':
      benchMetrics.itemsRemoved++;
      break;
    case 'itemMoved':
      benchMetrics.itemsMoved++;
      break;
    case 'rowFactory':
      benchMetrics.rowFactoryInvocations++;
      break;
    case 'keyLookup':
      benchMetrics.keyLookups++;
      break;
    case 'keyHit':
      benchMetrics.keyHits++;
      break;
    case 'keyMiss':
      benchMetrics.keyMisses++;
      break;
    case 'domInsert':
      benchMetrics.domInserts++;
      break;
    case 'domRemove':
      benchMetrics.domRemoves++;
      break;
    case 'domMove':
      benchMetrics.domMoves++;
      break;
    case 'domAttrSet':
      benchMetrics.domAttrSets++;
      break;
    case 'domTextSet':
      benchMetrics.domTextSets++;
      break;
  }
}

function recordBenchFastLane(name: string) {
  if (!askrGlobal.__ASKR_BENCH__) return;
  benchMetrics.fastLaneName = name;
}

function recordBenchTiming(phase: 'reconcile' | 'domCommit', ms: number) {
  if (!askrGlobal.__ASKR_BENCH__) return;
  if (phase === 'reconcile') {
    benchMetrics.reconcilePhaseMs = ms;
  } else {
    benchMetrics.domCommitPhaseMs = ms;
  }
}

function getBenchMetrics(): BenchMetrics {
  return { ...benchMetrics };
}

export { getBenchMetrics };

export interface ForItemInstance<T> {
  key: string | number | null;
  item: T;
  indexSignal: State<number>;
  componentInstance: ComponentInstance;
  vnode: VNode | undefined;
  _startStateIndex: number; // Global state index when item was created
  _dom?: Node; // Cached DOM node for efficient updates
}

export interface ForState<T> {
  sourceState: State<T[]> | null;
  items: Map<string | number | null, ForItemInstance<T>>;
  orderedKeys: Array<string | number | null>;
  byFn: (item: T, index: number) => string | number | null;
  renderFn: (item: T, index: () => number) => VNode;
  parentInstance: ComponentInstance | null;
  mounted: boolean;
}

/**
 * Evaluate JSXElement to VNode
 *
 * When a For render function returns a JSXElement (from JSX syntax like <Row .../>),
 * we need to evaluate it by calling the component function to get the actual vnode.
 * This handles the common case of returning a component from For's render function.
 */
function evaluateJSXElement(value: unknown): VNode {
  // Check if this is a JSXElement (has $$typeof marker)
  if (
    value &&
    typeof value === 'object' &&
    '$$typeof' in value &&
    (value as JSXElement).$$typeof === ELEMENT_TYPE
  ) {
    const jsxEl = value as JSXElement;

    // If the type is a function (component), call it to get the vnode
    if (typeof jsxEl.type === 'function') {
      const componentFn = jsxEl.type as (props: Props) => unknown;
      const result = componentFn(jsxEl.props || {});
      // Recursively evaluate in case the component returns another JSXElement
      return evaluateJSXElement(result);
    }

    // For intrinsic elements (string type) or symbols, return as-is
    // The renderer will handle these
    return jsxEl as VNode;
  }

  // Not a JSXElement, return as-is
  return value as VNode;
}

export function createForState<T>(
  source: State<T[]> | (() => T[]),
  byFn: (item: T, index: number) => string | number,
  renderFn: (item: T, index: () => number) => VNode
): ForState<T> {
  const sourceState = typeof source === 'function' ? null : source;
  const parentInstance = getCurrentInstance();

  return {
    sourceState,
    items: new Map(),
    orderedKeys: [],
    byFn: byFn,
    renderFn,
    parentInstance,
    mounted: false,
  };
}

let _forRenderCounter = 1;

export function createItemInstance<T>(
  key: string | number | null,
  item: T,
  index: number,
  forState: ForState<T>
): ForItemInstance<T> {
  recordBenchEvent('itemCreated');

  // Create index signal manually without going through state() hook
  // to avoid hook order violations (each For item creates its signal dynamically)
  let indexValue = index;
  // Cast to avoid strict structural check during dts build — we'll add iterator below
  const indexSignal: State<number> = Object.assign(() => indexValue, {
    set(newValue: number | ((prev: number) => number)) {
      const nextValue =
        typeof newValue === 'function' ? newValue(indexValue) : newValue;
      if (nextValue !== indexValue) {
        indexValue = nextValue;
        // Index changes typically don't need to trigger re-renders
        // but we provide the signal for user convenience
      }
    },
  }) as unknown as State<number>;

  // Provide iterable interface so callers can destructure: const [i, setI] = indexSignal
  (
    indexSignal as unknown as {
      [Symbol.iterator]?: () => Iterator<
        State<number> | typeof indexSignal.set
      >;
    }
  )[Symbol.iterator] = function* (): Generator<
    State<number> | typeof indexSignal.set,
    void,
    unknown
  > {
    yield indexSignal;
    yield indexSignal.set;
  };

  // Create isolated component for this item. The renderFn is executed while
  // this instance is the current component so nested state() calls register
  // readers against this instance for precise notification.
  const noopComponentFn: ComponentFunction = () => null;
  const itemComponent = createComponentInstance(
    `for-item-${key}`,
    noopComponentFn,
    {},
    null
  );

  // Inherit parent context
  if (forState.parentInstance) {
    itemComponent.ownerFrame = forState.parentInstance.ownerFrame;
  }

  // Execute initial render function while treating this instance as the
  // current component so `state()` calls register correctly.
  const savedInst = getCurrentInstance();
  setCurrentComponentInstance(itemComponent);

  // Capture the current global state index so we can restore it on re-renders
  const startStateIndex = getCurrentStateIndex();

  // Prepare render token and pending reads so finalizeReadSubscriptions works
  // (this mirrors behavior in runComponent).
  itemComponent._currentRenderToken = _forRenderCounter++;
  itemComponent._pendingReadStates = new Set();

  recordBenchEvent('rowFactory');
  const vnode = evaluateJSXElement(
    forState.renderFn(item, () => indexSignal())
  );

  // Materialize key on vnode so renderer key extraction works
  if (vnode && typeof vnode === 'object' && 'type' in vnode) {
    const vn = vnode as DOMElement;
    vn.key = key;

    // Automatically add data-key to intrinsic elements (tr, li, etc)
    // so we don't need to manually add it in the render function.
    if (typeof vn.type === 'string') {
      if (!vn.props) vn.props = {};
      if (vn.props['data-key'] === undefined) {
        vn.props['data-key'] = String(key);
      }
    }
  }

  // Commit initial subscriptions so nested state changes will notify this
  // instance's pending task appropriately.
  finalizeReadSubscriptions(itemComponent);

  // Restore previous current instance
  setCurrentComponentInstance(savedInst);

  // Create the item instance to capture in closure (avoids redundant Map lookup)
  const itemInstance: ForItemInstance<T> = {
    key,
    item,
    indexSignal,
    componentInstance: itemComponent,
    vnode,
    _startStateIndex: startStateIndex,
  };

  // Override the pending flush task for this item so that when nested state
  // changes we recompute this item's vnode and request the parent to re-render.
  // Perf: capture itemInstance directly to avoid Map.get() during flush
  itemComponent._pendingFlushTask = () => {
    const saved = getCurrentInstance();
    setCurrentComponentInstance(itemComponent);

    // Reset state index tracking for this re-render (same as executeComponentSync)
    itemComponent.stateIndexCheck = -1;

    // Reset read tracking: iterate only if states exist (O(states) not O(items))
    const stateValues = itemComponent.stateValues;
    for (let i = 0; i < stateValues.length; i++) {
      const state = stateValues[i];
      if (state) {
        state._hasBeenRead = false;
      }
    }

    // Restore the global state index to where it was when this item was created
    // This ensures state() calls use the same indices as during initial render
    setStateIndex(startStateIndex);

    itemComponent._currentRenderToken = _forRenderCounter++;
    itemComponent._pendingReadStates = new Set();

    // Safely re-render into vnode slot for this item
    try {
      const newVnode = evaluateJSXElement(
        forState.renderFn(item, () => indexSignal())
      );
      // Update the stored vnode directly in captured instance
      itemInstance.vnode = newVnode;
      // Commit read subscriptions for this re-render
      finalizeReadSubscriptions(itemComponent);
    } finally {
      setCurrentComponentInstance(saved);
    }

    // Ask parent For boundary to re-render so DOM updates are applied
    const parent = forState.parentInstance;
    if (parent) parent._enqueueRun?.();
  };

  return itemInstance;
}

export function reconcileForItems<T>(
  forState: ForState<T>,
  newArray: T[]
): VNode[] {
  if (askrGlobal.__ASKR_BENCH__) {
    resetBenchMetrics();
  }

  const reconcileStartMs = askrGlobal.__ASKR_BENCH__ ? performance.now() : 0;

  const { items, orderedKeys, byFn } = forState;
  const oldLen = orderedKeys.length;
  const newLen = newArray.length;

  // ─────────────────────────────────────────────────────────────────────────
  // FAST PATH A: APPEND
  // Guard: oldLen <= newLen && all old keys match new keys at same indices
  // ─────────────────────────────────────────────────────────────────────────
  if (oldLen <= newLen) {
    let canUseAppendPath = true;
    for (let i = 0; i < oldLen; i++) {
      const key = byFn(newArray[i], i);
      if (key !== orderedKeys[i]) {
        canUseAppendPath = false;
        break;
      }
    }

    if (canUseAppendPath) {
      recordBenchFastLane('APPEND');
      const resultVNodes: VNode[] = [];

      // Update existing rows in-place
      for (let i = 0; i < oldLen; i++) {
        const item = newArray[i];
        const key = orderedKeys[i];
        const existing = items.get(key)!;
        recordBenchEvent('itemReused');

        const itemChanged = existing.item !== item;
        const indexChanged = existing.indexSignal() !== i;

        if (itemChanged) {
          existing.item = item;
          const savedInst = getCurrentInstance();
          setCurrentComponentInstance(existing.componentInstance);
          recordBenchEvent('rowFactory');
          existing.vnode = evaluateJSXElement(
            forState.renderFn(item, () => existing.indexSignal())
          );
          try {
            if (
              existing.vnode &&
              typeof existing.vnode === 'object' &&
              'type' in existing.vnode
            )
              (existing.vnode as { key?: string | number | null }).key = key;
          } catch (e) {
            void e;
          }

          setCurrentComponentInstance(savedInst);
        }

        if (indexChanged) {
          existing.indexSignal.set(i);
        }

        resultVNodes.push(existing.vnode);
      }

      // Create and append new rows
      for (let i = oldLen; i < newLen; i++) {
        const item = newArray[i];
        const key = byFn(item, i);
        const itemInstance = createItemInstance(key, item, i, forState);
        items.set(key, itemInstance);
        resultVNodes.push(itemInstance.vnode);
        orderedKeys[i] = key;
      }

      if (askrGlobal.__ASKR_BENCH__) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
      }

      return resultVNodes;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FAST PATH B: TRUNCATE
  // Guard: newLen <= oldLen && all new keys match old keys at same indices
  // ─────────────────────────────────────────────────────────────────────────
  if (newLen <= oldLen) {
    let canUseTruncatePath = true;
    for (let i = 0; i < newLen; i++) {
      const key = byFn(newArray[i], i);
      if (key !== orderedKeys[i]) {
        canUseTruncatePath = false;
        break;
      }
    }

    if (canUseTruncatePath) {
      recordBenchFastLane('TRUNCATE');
      const resultVNodes: VNode[] = [];

      // Update existing rows in-place
      for (let i = 0; i < newLen; i++) {
        const item = newArray[i];
        const key = orderedKeys[i];
        const existing = items.get(key)!;
        recordBenchEvent('itemReused');

        const itemChanged = existing.item !== item;
        const indexChanged = existing.indexSignal() !== i;

        if (itemChanged) {
          existing.item = item;
          const savedInst = getCurrentInstance();
          setCurrentComponentInstance(existing.componentInstance);
          recordBenchEvent('rowFactory');
          existing.vnode = evaluateJSXElement(
            forState.renderFn(item, () => existing.indexSignal())
          );
          try {
            if (
              existing.vnode &&
              typeof existing.vnode === 'object' &&
              'type' in existing.vnode
            )
              (existing.vnode as { key?: string | number | null }).key = key;
          } catch (e) {
            void e;
          }
          setCurrentComponentInstance(savedInst);
        }

        if (indexChanged) {
          existing.indexSignal.set(i);
        }

        resultVNodes.push(existing.vnode);
      }

      // Remove tail rows
      for (let i = newLen; i < oldLen; i++) {
        const key = orderedKeys[i];
        const itemInstance = items.get(key);
        if (itemInstance) {
          recordBenchEvent('itemRemoved');
          const instance = itemInstance.componentInstance;
          try {
            cleanupComponent(instance);
          } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
              console.error('[For] Cleanup error:', err);
            }
          }
          // Clean up cached DOM node if present
          if (itemInstance._dom instanceof Element) {
            removeAllListeners(itemInstance._dom);
            cleanupInstanceIfPresent(itemInstance._dom);
          }
          itemInstance.vnode = undefined;
          itemInstance._dom = undefined;
          items.delete(key);
        }
      }

      orderedKeys.length = newLen;
      forState.orderedKeys = orderedKeys;

      if (askrGlobal.__ASKR_BENCH__) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
      }

      return resultVNodes;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FAST PATH C: NO-REORDER (in-place update only)
  // Guard: oldLen === newLen && keys match at all indices
  // ─────────────────────────────────────────────────────────────────────────
  if (oldLen === newLen) {
    let canUseNoReorderPath = true;
    for (let i = 0; i < oldLen; i++) {
      const key = byFn(newArray[i], i);
      if (key !== orderedKeys[i]) {
        canUseNoReorderPath = false;
        break;
      }
    }

    if (canUseNoReorderPath) {
      recordBenchFastLane('NO_REORDER');
      const resultVNodes: VNode[] = [];

      // Update in-place only, no DOM moves needed
      for (let i = 0; i < oldLen; i++) {
        const item = newArray[i];
        const key = orderedKeys[i];
        const existing = items.get(key)!;
        recordBenchEvent('itemReused');

        const itemChanged = existing.item !== item;
        const indexChanged = existing.indexSignal() !== i;

        if (itemChanged) {
          existing.item = item;
          const savedInst = getCurrentInstance();
          setCurrentComponentInstance(existing.componentInstance);
          recordBenchEvent('rowFactory');
          const newVNode = evaluateJSXElement(
            forState.renderFn(item, () => existing.indexSignal())
          );
          existing.vnode = newVNode;
          try {
            if (
              existing.vnode &&
              typeof existing.vnode === 'object' &&
              'type' in existing.vnode
            )
              (existing.vnode as { key?: string | number | null }).key = key;
          } catch (e) {
            void e;
          }
          setCurrentComponentInstance(savedInst);
        }

        if (indexChanged) {
          existing.indexSignal.set(i);
        }

        resultVNodes.push(existing.vnode);
      }

      if (askrGlobal.__ASKR_BENCH__) {
        recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
      }

      return resultVNodes;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FULL KEYED RECONCILIATION (slow path for complex reorders)
  // Avoid allocating newKeyMap: iterate directly and track removals
  // ─────────────────────────────────────────────────────────────────────────
  recordBenchFastLane('FULL_KEYED');

  const toRemove = new Set(orderedKeys);
  const newOrderedKeys: Array<string | number | null> = [];
  const resultVNodes: VNode[] = [];

  // Single pass: iterate new array directly, no intermediate map
  for (let i = 0; i < newArray.length; i++) {
    const item = newArray[i];
    const key = byFn(item, i);
    recordBenchEvent('keyLookup');

    toRemove.delete(key);
    newOrderedKeys.push(key);

    const existing = items.get(key);
    recordBenchEvent(existing ? 'keyHit' : 'keyMiss');

    if (!existing) {
      // Added: create new item instance
      const itemInstance = createItemInstance(key, item, i, forState);
      items.set(key, itemInstance);
      resultVNodes.push(itemInstance.vnode);
    } else {
      // Exists: check if item changed (by identity)
      recordBenchEvent('itemReused');
      const itemChanged = existing.item !== item;
      const indexChanged = existing.indexSignal() !== i;

      if (itemChanged) {
        // Item data changed: update and re-execute
        existing.item = item;

        const savedInst = getCurrentInstance();
        setCurrentComponentInstance(existing.componentInstance);

        recordBenchEvent('rowFactory');
        existing.vnode = evaluateJSXElement(
          forState.renderFn(item, () => existing.indexSignal())
        );
        try {
          if (
            existing.vnode &&
            typeof existing.vnode === 'object' &&
            'type' in existing.vnode
          )
            (existing.vnode as { key?: string | number | null }).key = key;
        } catch (e) {
          void e;
        }

        setCurrentComponentInstance(savedInst);
      }

      if (indexChanged) {
        // Index changed: update index signal (triggers re-render if index is used)
        existing.indexSignal.set(i);
      }

      resultVNodes.push(existing.vnode);
    }
  }

  // Remove deleted items
  for (const key of toRemove) {
    const itemInstance = items.get(key);
    if (itemInstance) {
      recordBenchEvent('itemRemoved');
      // Clean up component instance
      const instance = itemInstance.componentInstance;
      try {
        cleanupComponent(instance);
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[For] Cleanup error:', err);
        }
      }

      // Clean up cached DOM node if present
      if (itemInstance._dom instanceof Element) {
        removeAllListeners(itemInstance._dom);
        cleanupInstanceIfPresent(itemInstance._dom);
      }

      itemInstance.vnode = undefined;
      itemInstance._dom = undefined;

      items.delete(key);
    }
  }

  forState.orderedKeys = newOrderedKeys;

  // Record reconcile timing
  if (askrGlobal.__ASKR_BENCH__) {
    recordBenchTiming('reconcile', performance.now() - reconcileStartMs);
  }

  return resultVNodes;
}

export function evaluateForState<T>(
  forState: ForState<T>,
  source: State<T[]> | (() => T[])
): VNode[] {
  const currentArray =
    typeof source === 'function' ? source() : (source as State<T[]>)();

  if (!Array.isArray(currentArray)) {
    throw new Error('For source must evaluate to an array');
  }

  return reconcileForItems(forState, currentArray);
}
