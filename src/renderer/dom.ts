import { logger } from '../dev/logger';
import { STATIC_CHILDREN } from '../common/jsx';
import { getRuntimeEnv } from './env';
import type { Props } from '../common/props';
import { Fragment } from '../jsx/jsx-runtime';
import {
  CONTEXT_FRAME_SYMBOL,
  withContext,
  getCurrentContextFrame,
  ContextFrame,
} from '../runtime/context';
import {
  createComponentInstance,
  cleanupComponent,
  renderComponentInline,
  mountInstanceInline,
  getCurrentInstance,
  setCurrentComponentInstance as _setCurrentInstance,
  warnUnusedStateReads,
  type ComponentInstance,
  type ComponentFunction,
} from '../runtime/component';
import {
  elementListeners,
  removeAllListeners,
  teardownNodeSubtree,
  elementReactivePropsCleanup,
  removeElementListeners,
  removeElementReactiveProps,
} from './cleanup';
import {
  setDevValue,
  incDevCounter,
  getDevValue,
} from '../runtime/dev-namespace';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { __FOR_BOUNDARY__ } from '../common/vnode';
import {
  evaluateForState,
  clearForDomUpdateState,
  isBenchMetricScopeActive,
  recordBenchCounter,
  recordBenchEvent,
  recordBenchTiming,
  type ForState,
  type ForCommitStrategy,
  withBenchMetricScope,
} from '../runtime/for';
import {
  clearCaseDomUpdateState,
  clearShowDomUpdateState,
  evaluateCaseState,
  evaluateShowState,
  type ControlBoundaryState,
} from '../runtime/control';
import { keyedElements } from './keyed';
import {
  parseEventName,
  getPassiveOptions,
  createMutableWrappedHandler,
  isSkippedProp,
  hasNonTrivialProps,
  readElementClassName,
  now,
  recordDOMReplace,
  recordFastPathStats,
  logFastPathDebug,
  writeElementClassName,
} from './utils';
import type { ReadableSource } from '../runtime/readable';
import { globalScheduler } from '../runtime/scheduler';
import { incrementPerfMetric } from '../runtime/perf-metrics';
import {
  isEventDelegationEnabled,
  addDelegatedListener,
  getDelegatedHandlerForElement,
  getDelegatedHandlersForElement,
  updateDelegatedListener,
  removeDelegatedListener,
  isDelegatedEvent,
} from '../runtime/events';

type ElementWithContext = DOMElement & {
  [CONTEXT_FRAME_SYMBOL]?: ContextFrame;
  __instance?: ComponentInstance;
};

type InstanceHostElement = Element & {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
  __ASKR_WRAPPER_HOST?: boolean;
};

export const IS_DOM_AVAILABLE = typeof document !== 'undefined';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function resolveChildNamespace(
  type: string,
  parentNamespace?: string
): string | undefined {
  if (type === 'svg') return SVG_NAMESPACE;
  if (parentNamespace === SVG_NAMESPACE && type !== 'foreignObject') {
    return SVG_NAMESPACE;
  }
  return undefined;
}

function createElementForNamespace(
  type: string,
  parentNamespace?: string
): Element {
  const namespace = resolveChildNamespace(type, parentNamespace);
  return namespace
    ? document.createElementNS(namespace, type)
    : document.createElement(type);
}

function getHydrationSkipBoundary(el: Element): Element | null {
  return el.closest('[data-skip-hydrate="true"]');
}

function isHydrationSkipped(el: Element): boolean {
  return getHydrationSkipBoundary(el) !== null;
}

function clearHydrationDeferredSubtree(el: Element): void {
  const boundary = getHydrationSkipBoundary(el);
  if (!boundary) return;
  if (boundary === el) {
    removeAllListeners(el);
    removeElementReactiveProps(el);
  }
}

let fallbackComponentInstanceId = 0;

function nextComponentInstanceId(): string {
  const key = '__COMPONENT_INSTANCE_ID';
  try {
    incDevCounter(key);
    const n = getDevValue<number>(key);
    if (typeof n === 'number' && Number.isFinite(n)) return `comp-${n}`;
  } catch {
    // Fall through to local counter
  }
  fallbackComponentInstanceId++;
  return `comp-${fallbackComponentInstanceId}`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Event Handler Management
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Add an event listener to an element with tracking
 * Uses event delegation when enabled (opt-out model)
 */
function addTrackedListener(
  el: Element,
  eventName: string,
  handler: EventListener
): void {
  const useDelegation =
    isEventDelegationEnabled() && isDelegatedEvent(eventName);

  if (useDelegation) {
    addDelegatedListener(el, eventName, handler, handler, undefined);
    if (isBenchMetricScopeActive('coldCreate')) {
      recordBenchCounter('listenerBindings');
    }
    return;
  }

  const options = getPassiveOptions(eventName);
  const mutableHandler = createMutableWrappedHandler(handler, true);
  const trackedHandler = mutableHandler.handler;

  {
    if (options !== undefined) {
      el.addEventListener(eventName, trackedHandler, options);
    } else {
      el.addEventListener(eventName, trackedHandler);
    }
  }

  if (!elementListeners.has(el)) {
    elementListeners.set(el, new Map());
  }
  elementListeners.get(el)!.set(eventName, {
    handler: trackedHandler,
    original: handler,
    options,
    isDelegated: false,
    updateHandler: mutableHandler?.updateHandler,
  });

  if (isBenchMetricScopeActive('coldCreate')) {
    recordBenchCounter('listenerBindings');
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Reactive Prop Management - Dirty Descriptor Invalidation
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ReactivePropDescriptor {
  el: Element;
  propName: string;
  propFn: () => unknown;
  tagName: string;
  readSources: Set<ReadableSource<unknown>>;
  isActive: boolean;
  lastValue: unknown;
  lastClassTokens: string[] | null;
}

const reactivePropRegistry = new Set<ReactivePropDescriptor>();
const dirtyReactiveProps = new Set<ReactivePropDescriptor>();
const reactivePropsBySource = new WeakMap<
  ReadableSource<unknown>,
  Set<ReactivePropDescriptor>
>();
let hasPendingReactivePropFlush = false;
let reactivePropTrackingToken = 0;

/**
 * Pre-allocated sentinel used to reset `_pendingReadSources` in the finally
 * block without allocating a new Set on every `evaluateAndSyncReactiveProp`
 * call. Safe to share because `_setCurrentInstance(prevInstance)` runs
 * immediately after in the same synchronous block, so no reactive reads will
 * ever be attributed to `reactivePropTrackingInstance` after the reset.
 */
const _EMPTY_PENDING_SOURCES = new Set<ReadableSource<unknown>>();

/**
 * Reusable buffer for tracking which sources are read during a single
 * reactive-prop evaluation.  Must *not* be relied on across call boundaries;
 * each call clears it before use.  This avoids one `new Set()` allocation
 * per hot-path reactive-prop re-evaluation.
 */
const _evalSourceBuffer = new Set<ReadableSource<unknown>>();

const reactivePropTrackingInstance = {
  _pendingReadSources: new Set<ReadableSource<unknown>>(),
  _currentRenderToken: 0,
} as Partial<ComponentInstance> as ComponentInstance;

function registerReactivePropSource(
  source: ReadableSource<unknown>,
  descriptor: ReactivePropDescriptor
): void {
  let descriptors = reactivePropsBySource.get(source);
  if (!descriptors) {
    descriptors = new Set();
    reactivePropsBySource.set(source, descriptors);
  }
  descriptors.add(descriptor);
}

function unregisterReactivePropSource(
  source: ReadableSource<unknown>,
  descriptor: ReactivePropDescriptor
): void {
  reactivePropsBySource.get(source)?.delete(descriptor);
}

function clearReactivePropSubscriptions(
  descriptor: ReactivePropDescriptor
): void {
  for (const source of descriptor.readSources) {
    unregisterReactivePropSource(source, descriptor);
  }
  descriptor.readSources.clear();
}

/**
 * Evaluate a reactive prop's function while tracking its source dependencies,
 * then synchronise subscriptions in a single pass.
 *
 * Optimised hot path:
 * - Uses `_evalSourceBuffer` (a shared reusable Set) for read tracking, saving
 *   one `new Set()` allocation per call compared to the naÃ¯ve approach.
 * - After evaluation, checks whether the source set changed.  When sources are
 *   identical to the previous evaluation (the overwhelmingly common case for
 *   reactive class props that always read the same signal), no subscription
 *   bookkeeping is needed and no new Set is allocated.
 * - Uses `_EMPTY_PENDING_SOURCES` sentinel in the finally block instead of
 *   `new Set()`, saving another allocation per call.
 *
 * Returns the evaluated value so callers can avoid a separate intermediate
 * `{ value, readSources }` object.
 */
function evaluateAndSyncReactiveProp(
  descriptor: ReactivePropDescriptor
): unknown {
  const prevInstance = getCurrentInstance();

  _evalSourceBuffer.clear();
  reactivePropTrackingToken += 1;
  reactivePropTrackingInstance._pendingReadSources = _evalSourceBuffer;
  reactivePropTrackingInstance._currentRenderToken = reactivePropTrackingToken;

  _setCurrentInstance(reactivePropTrackingInstance);

  let value: unknown;
  try {
    value = descriptor.propFn();
  } finally {
    // Restore state without allocating a new Set.
    reactivePropTrackingInstance._pendingReadSources =
      _EMPTY_PENDING_SOURCES as Set<ReadableSource<unknown>>;
    reactivePropTrackingInstance._currentRenderToken = 0;
    _setCurrentInstance(prevInstance);
  }

  // â”€â”€ Inline syncReactivePropSubscriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Fast path: if the source set is unchanged, skip all bookkeeping and avoid
  // allocating a new Set for descriptor.readSources.  This is the common case
  // for reactive props like `() => isSelected(id) ? "danger" : ""` where the
  // same signal is always read.
  const prevSources = descriptor.readSources;
  const bufSize = _evalSourceBuffer.size;

  if (prevSources.size === bufSize) {
    let same = true;
    for (const s of prevSources) {
      if (!_evalSourceBuffer.has(s)) {
        same = false;
        break;
      }
    }
    if (same) {
      // Sources unchanged â€” keep prevSources as descriptor.readSources (no
      // allocation, no register/unregister calls).
      return value;
    }
  }

  // Sources changed â€” build a snapshot from the buffer and do the full diff.
  const nextSources = new Set(_evalSourceBuffer);

  for (const source of prevSources) {
    if (!nextSources.has(source)) {
      unregisterReactivePropSource(source, descriptor);
    }
  }
  for (const source of nextSources) {
    if (!prevSources.has(source)) {
      registerReactivePropSource(source, descriptor);
    }
  }
  descriptor.readSources = nextSources;

  return value;
}

function flushDirtyReactiveProps(): void {
  hasPendingReactivePropFlush = false;

  if (dirtyReactiveProps.size === 0) {
    return;
  }

  const pending = Array.from(dirtyReactiveProps);
  dirtyReactiveProps.clear();

  for (const descriptor of pending) {
    if (!descriptor.isActive) continue;

    incrementPerfMetric('reactivePropReevaluations');

    try {
      const value = evaluateAndSyncReactiveProp(descriptor);

      if (Object.is(descriptor.lastValue, value)) {
        incrementPerfMetric('skippedDomPropWrites');
        continue;
      }

      applyPropValue(
        descriptor.el,
        descriptor.propName,
        value,
        descriptor.tagName,
        descriptor.lastValue,
        descriptor
      );
      descriptor.lastValue = value;
    } catch (err) {
      if (getRuntimeEnv().NODE_ENV !== 'production') {
        logger.warn('[Askr] Reactive prop update failed:', err);
      }
    }
  }
}

export function markReactivePropsDirtySource(
  source: ReadableSource<unknown>
): void {
  const descriptors = reactivePropsBySource.get(source);
  if (!descriptors || descriptors.size === 0) {
    return;
  }

  let shouldScheduleFlush = false;
  for (const descriptor of descriptors) {
    if (!descriptor.isActive || dirtyReactiveProps.has(descriptor)) {
      continue;
    }
    dirtyReactiveProps.add(descriptor);
    shouldScheduleFlush = true;
  }

  if (shouldScheduleFlush && !hasPendingReactivePropFlush) {
    hasPendingReactivePropFlush = true;
    globalScheduler.enqueueInLane('reactive', flushDirtyReactiveProps);
  }
}

/**
 * Set up a reactive prop that re-evaluates when its dependencies change
 * Returns a cleanup function to unsubscribe
 */
function setupReactiveProp(
  el: Element,
  propName: string,
  propFn: () => unknown,
  tagName: string
): { cleanup: () => void; updateFn: (nextFn: () => unknown) => void } {
  const descriptor: ReactivePropDescriptor = {
    el,
    propName,
    propFn,
    tagName,
    readSources: new Set(),
    isActive: true,
    lastValue: undefined,
    lastClassTokens: null,
  };

  reactivePropRegistry.add(descriptor);
  const value = evaluateAndSyncReactiveProp(descriptor);
  applyPropValue(el, propName, value, tagName, undefined, descriptor);
  descriptor.lastValue = value;

  if (isBenchMetricScopeActive('coldCreate')) {
    recordBenchCounter('reactivePropsMounted');
  }

  const cleanup = () => {
    descriptor.isActive = false;
    reactivePropRegistry.delete(descriptor);
    dirtyReactiveProps.delete(descriptor);
    clearReactivePropSubscriptions(descriptor);
  };

  const updateFn = (nextFn: () => unknown): void => {
    if (!descriptor.isActive) {
      return;
    }

    descriptor.propFn = nextFn;

    try {
      const previousValue = descriptor.lastValue;
      const value = evaluateAndSyncReactiveProp(descriptor);

      if (Object.is(previousValue, value)) {
        incrementPerfMetric('skippedDomPropWrites');
        return;
      }

      applyPropValue(
        descriptor.el,
        descriptor.propName,
        value,
        descriptor.tagName,
        previousValue,
        descriptor
      );
      descriptor.lastValue = value;
    } catch (err) {
      if (getRuntimeEnv().NODE_ENV !== 'production') {
        logger.warn('[Askr] Reactive prop update failed:', err);
      }
    }
  };

  return {
    cleanup,
    updateFn,
  };
}

/**
 * Apply a prop value to an element (helper for reactive props)
 */
function applyPropValue(
  el: Element,
  key: string,
  value: unknown,
  tagName: string,
  previousValue?: unknown,
  descriptor?: ReactivePropDescriptor
): void {
  if (value === undefined || value === null || value === false) {
    if (key === 'class' || key === 'className') {
      const previousTokens = descriptor?.lastClassTokens;
      if (previousTokens && previousTokens.length > 0) {
        el.classList.remove(...previousTokens);
        incrementPerfMetric('classListPatchOps');
      } else {
        writeElementClassName(el, '');
      }
      if (descriptor) {
        descriptor.lastClassTokens = [];
      }
    } else {
      el.removeAttribute(key);
    }
    return;
  }

  if (key === 'class' || key === 'className') {
    applyClassPropValue(el, value, previousValue, descriptor);
  } else if (key === 'value' || key === 'checked') {
    applyFormControlProp(el, key, value, tagName);
  } else {
    el.setAttribute(key, String(value));
  }
}

function tokenizeClassValue(value: unknown): string[] | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return [];
  }

  return trimmed.split(/\s+/);
}

function patchClassList(
  el: Element,
  previousTokens: string[],
  nextTokens: string[]
): void {
  if (previousTokens.length === nextTokens.length) {
    let identical = true;
    for (let index = 0; index < previousTokens.length; index += 1) {
      if (previousTokens[index] !== nextTokens[index]) {
        identical = false;
        break;
      }
    }
    if (identical) {
      return;
    }
  }

  if (previousTokens.length === 0) {
    if (nextTokens.length === 0) {
      return;
    }
    el.classList.add(...nextTokens);
    incrementPerfMetric('classListPatchOps');
    return;
  }

  if (nextTokens.length === 0) {
    el.classList.remove(...previousTokens);
    incrementPerfMetric('classListPatchOps');
    return;
  }

  if (previousTokens.length === 1 && nextTokens.length === 1) {
    el.classList.remove(previousTokens[0]);
    el.classList.add(nextTokens[0]);
    incrementPerfMetric('classListPatchOps');
    return;
  }

  const nextSet = new Set(nextTokens);
  const previousSet = new Set(previousTokens);

  for (const token of previousTokens) {
    if (!nextSet.has(token)) {
      el.classList.remove(token);
    }
  }

  for (const token of nextTokens) {
    if (!previousSet.has(token)) {
      el.classList.add(token);
    }
  }

  incrementPerfMetric('classListPatchOps');
}

function applyClassPropValue(
  el: Element,
  value: unknown,
  previousValue: unknown,
  descriptor?: ReactivePropDescriptor
): void {
  const nextString = String(value);
  const nextTokens = tokenizeClassValue(nextString);
  const previousTokens =
    descriptor?.lastClassTokens ?? tokenizeClassValue(previousValue);

  if (nextTokens && previousTokens) {
    patchClassList(el, previousTokens, nextTokens);
    if (descriptor) {
      descriptor.lastClassTokens = nextTokens;
    }
    return;
  }

  writeElementClassName(el, nextString);
  if (descriptor) {
    descriptor.lastClassTokens = nextTokens;
  }
}

/**
 * Apply attributes and event listeners to an element from props
 */
function applyPropsToElement(
  el: Element,
  props: Record<string, unknown>,
  tagName: string
): void {
  if (isHydrationSkipped(el)) {
    return;
  }

  for (const key in props) {
    const value = props[key];
    // Handle ref BEFORE isSkippedProp check since it needs special processing
    if (key === 'ref') {
      applyRef(el, value);
      continue;
    }
    if (isSkippedProp(key)) continue;
    if (value === undefined || value === null || value === false) continue;

    const eventName = parseEventName(key);
    if (eventName) {
      addTrackedListener(el, eventName, value as EventListener);
      continue;
    }

    // Check if value is a function (reactive prop)
    if (typeof value === 'function' && !eventName && key !== 'ref') {
      // Set up reactive prop tracking
      const reactive = setupReactiveProp(
        el,
        key,
        value as () => unknown,
        tagName
      );

      // Store cleanup function and function reference
      if (!elementReactivePropsCleanup.has(el)) {
        elementReactivePropsCleanup.set(el, new Map());
      }
      elementReactivePropsCleanup.get(el)!.set(key, {
        cleanup: reactive.cleanup,
        updateFn: reactive.updateFn,
        fnRef: value as () => unknown,
      });
      continue;
    }

    if (key === 'class' || key === 'className') {
      writeElementClassName(el, String(value));
    } else if (key === 'value' || key === 'checked') {
      applyFormControlProp(el, key, value, tagName);
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

type Ref<T> =
  | ((value: T | null) => void)
  | { current: T | null }
  | null
  | undefined;

function applyRef<T>(el: T, ref: unknown): void {
  const r = ref as Ref<T>;
  if (!r) return;
  if (typeof r === 'function') {
    r(el);
    return;
  }
  // Fast path: use Object.isExtensible check instead of try/catch
  if (Object.isExtensible(r)) {
    (r as { current: T | null }).current = el;
  }
}

/**
 * Apply value/checked props to form controls
 */
function applyFormControlProp(
  el: Element,
  key: string,
  value: unknown,
  tagName: string
): void {
  if (key === 'value') {
    if (
      tagNamesEqualIgnoreCase(tagName, 'input') ||
      tagNamesEqualIgnoreCase(tagName, 'textarea') ||
      tagNamesEqualIgnoreCase(tagName, 'select')
    ) {
      (el as HTMLInputElement & Props).value = String(value);
      el.setAttribute('value', String(value));
    } else {
      el.setAttribute('value', String(value));
    }
  } else if (key === 'checked') {
    if (tagNamesEqualIgnoreCase(tagName, 'input')) {
      (el as HTMLInputElement & Props).checked = Boolean(value);
      el.setAttribute('checked', String(Boolean(value)));
    } else {
      el.setAttribute('checked', String(Boolean(value)));
    }
  }
}

/**
 * Materialize vnode key as data-key attribute
 */
function materializeKey(
  el: Element,
  vnode: DOMElement,
  props: Record<string, unknown>
): void {
  const vnodeKey = vnode.key ?? props?.key;
  if (vnodeKey !== undefined) {
    el.setAttribute('data-key', String(vnodeKey));
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Dynamic List Warnings
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Warn about missing keys on dynamic lists (dev only)
 */
function warnMissingKeys(children: unknown[]): void {
  if (getRuntimeEnv().NODE_ENV === 'production') return;

  let hasElements = false;
  let hasKeys = false;

  for (const item of children) {
    if (typeof item === 'object' && item !== null && 'type' in item) {
      if ((item as DOMElement).type === __FOR_BOUNDARY__) continue;
      hasElements = true;
      const rawKey =
        (item as DOMElement).key ??
        ((item as DOMElement).props as Record<string, unknown> | undefined)
          ?.key;
      if (rawKey !== undefined) {
        hasKeys = true;
        break;
      }
    }
  }

  if (hasElements && !hasKeys) {
    const inst = getCurrentInstance();
    const warnings = inst ? (inst.devWarningsEmitted ??= new Set()) : null;
    if (warnings?.has('missing-keys')) return;
    warnings?.add('missing-keys');
    try {
      const name = inst?.fn?.name || '<anonymous>';
      logger.warn(
        `Missing keys on dynamic lists in ${name}. Each child in a list should have a unique "key" prop.`
      );
    } catch {
      logger.warn(
        'Missing keys on dynamic lists. Each child in a list should have a unique "key" prop.'
      );
    }
  }
}

function hasStaticChildrenMarker(children: unknown[]): boolean {
  return (
    (
      children as unknown as {
        [STATIC_CHILDREN]?: boolean;
      }
    )[STATIC_CHILDREN] === true
  );
}

function maybeWarnMissingKeys(children: unknown[]): void {
  if (!hasStaticChildrenMarker(children)) {
    warnMissingKeys(children);
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DOM Node Creation
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Create a DOM node from a VNode
 */
export function createDOMNode(
  node: unknown,
  parentNamespace?: string
): Node | null {
  // SSR guard: don't attempt DOM ops when document is unavailable
  if (!IS_DOM_AVAILABLE) {
    if (getRuntimeEnv().NODE_ENV !== 'production') {
      try {
        logger.warn('[Askr] createDOMNode called in non-DOM environment');
      } catch {
        // ignore
      }
    }
    return null;
  }

  // Fast paths for primitives (most common)
  if (typeof node === 'string') {
    if (isBenchMetricScopeActive('coldCreate')) {
      recordBenchCounter('domNodesCreated');
    }
    return document.createTextNode(node);
  }
  if (typeof node === 'number') {
    if (isBenchMetricScopeActive('coldCreate')) {
      recordBenchCounter('domNodesCreated');
    }
    return document.createTextNode(String(node));
  }

  // Null/undefined/false
  if (!node) {
    return null;
  }

  // Array (fragment) - batch all at once
  if (Array.isArray(node)) {
    maybeWarnMissingKeys(node);
    const fragment = document.createDocumentFragment();
    for (const child of node) {
      const dom = createDOMNode(child, parentNamespace);
      if (dom) fragment.appendChild(dom);
    }
    return fragment;
  }

  // Element or Component
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const type = (node as DOMElement).type;
    const props = ((node as DOMElement).props || {}) as Record<string, unknown>;

    // Intrinsic element (string type)
    if (typeof type === 'string') {
      return createIntrinsicElement(
        node as DOMElement,
        type,
        props,
        parentNamespace
      );
    }

    // Component (function type) - inline execution
    if (typeof type === 'function') {
      return createComponentElement(
        node as ElementWithContext,
        type,
        props,
        parentNamespace
      );
    }

    // For boundary - special handling
    if (type === __FOR_BOUNDARY__) {
      return createForBoundary(node as DOMElement, props);
    }

    // Fragment support
    if (
      typeof type === 'symbol' &&
      (type === Fragment || String(type) === 'Symbol(Fragment)')
    ) {
      return createFragmentElement(node as DOMElement, props, parentNamespace);
    }
  }

  return null;
}

type StaticCreateChildShape = {
  textContent: string | null;
};

function tryGetStaticCreateChildShape(
  children: unknown
): StaticCreateChildShape | null {
  if (children === null || children === undefined || children === false) {
    return { textContent: null };
  }

  if (typeof children === 'string' || typeof children === 'number') {
    return { textContent: String(children) };
  }

  if (Array.isArray(children) && children.length === 1) {
    const child = children[0];
    if (child === null || child === undefined || child === false) {
      return { textContent: null };
    }
    if (typeof child === 'string' || typeof child === 'number') {
      return { textContent: String(child) };
    }
  }

  return null;
}

function isStaticCreateScalarValue(value: unknown): boolean {
  const valueType = typeof value;
  return (
    valueType === 'string' || valueType === 'number' || valueType === 'boolean'
  );
}

function tryGetStaticCreateFastPathShape(
  props: Record<string, unknown>,
  children: unknown
): StaticCreateChildShape | null {
  const childShape = tryGetStaticCreateChildShape(children);
  if (!childShape) {
    return null;
  }

  for (const key in props) {
    if (key === 'ref') {
      return null;
    }
    if (isSkippedProp(key)) {
      continue;
    }

    const value = props[key];
    if (value === undefined || value === null || value === false) {
      continue;
    }

    if (parseEventName(key) || !isStaticCreateScalarValue(value)) {
      return null;
    }
  }

  return childShape;
}

function applyStaticScalarPropsToElement(
  el: Element,
  props: Record<string, unknown>
): void {
  for (const key in props) {
    if (isSkippedProp(key)) {
      continue;
    }

    const value = props[key];
    if (value === undefined || value === null || value === false) {
      continue;
    }

    if (key === 'class' || key === 'className') {
      writeElementClassName(el, String(value));
    } else if (key === 'value' || key === 'checked') {
      (el as HTMLElement & Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

/**
 * Create an intrinsic DOM element (div, span, etc.)
 */
function createIntrinsicElement(
  node: DOMElement,
  type: string,
  props: Record<string, unknown>,
  parentNamespace?: string
): Element {
  const children = props.children ?? node.children;
  const elementNamespace = resolveChildNamespace(type, parentNamespace);
  const el = createElementForNamespace(type, parentNamespace);

  if (isBenchMetricScopeActive('coldCreate')) {
    recordBenchCounter('domNodesCreated');
  }

  // Materialize key into DOM attribute
  materializeKey(el, node, props);

  const staticCreateFastPath = tryGetStaticCreateFastPathShape(props, children);

  if (staticCreateFastPath) {
    applyStaticScalarPropsToElement(el, props);
    if (staticCreateFastPath.textContent !== null) {
      el.textContent = staticCreateFastPath.textContent;
      if (isBenchMetricScopeActive('coldCreate')) {
        recordBenchCounter('domNodesCreated');
      }
    }
    return el;
  }

  // Apply props/attributes
  applyPropsToElement(el, props, type);

  // Add children
  // CRITICAL: Use nullish coalescing (?) instead of || because children can be 0, false, or empty string

  if (children !== null && children !== undefined) {
    if (Array.isArray(children)) {
      maybeWarnMissingKeys(children);
      if (children.length > 1) {
        // Batch all children into a fragment so we touch the parent only once
        // instead of N times, reducing layout invalidations in the DOM engine.
        const childFrag = document.createDocumentFragment();
        for (const child of children) {
          const dom = createDOMNode(child, elementNamespace);
          if (dom) childFrag.appendChild(dom);
        }
        el.appendChild(childFrag);
      } else if (children.length === 1) {
        const dom = createDOMNode(children[0], elementNamespace);
        if (dom) el.appendChild(dom);
      }
    } else {
      const dom = createDOMNode(children, elementNamespace);
      if (dom) el.appendChild(dom);
    }
  }

  return el;
}

/**
 * Create element from a component function
 */
function cleanupDetachedComponentHost(host: InstanceHostElement): void {
  removeElementListeners(host);
  removeElementReactiveProps(host);

  const hostInstances = host.__ASKR_INSTANCES;
  if (hostInstances && hostInstances.length > 0) {
    for (const instance of hostInstances) {
      cleanupComponent(instance);
    }
  } else if (host.__ASKR_INSTANCE) {
    cleanupComponent(host.__ASKR_INSTANCE);
  }

  const descendants = host.querySelectorAll('*');
  for (let index = 0; index < descendants.length; index += 1) {
    const descendant = descendants[index] as InstanceHostElement;
    removeElementListeners(descendant);
    removeElementReactiveProps(descendant);

    if (descendant.__ASKR_INSTANCES?.length) {
      for (const instance of descendant.__ASKR_INSTANCES) {
        cleanupComponent(instance);
      }
      try {
        delete descendant.__ASKR_INSTANCES;
      } catch {
        // Ignore host cleanup failures.
      }
    } else if (descendant.__ASKR_INSTANCE) {
      cleanupComponent(descendant.__ASKR_INSTANCE);
      try {
        delete descendant.__ASKR_INSTANCE;
      } catch {
        // Ignore host cleanup failures.
      }
    }
  }

  try {
    delete host.__ASKR_INSTANCE;
    delete host.__ASKR_INSTANCES;
    delete host.__ASKR_WRAPPER_HOST;
  } catch {
    // Ignore host cleanup failures.
  }
}

function findHostInstanceByType(
  host: InstanceHostElement,
  type: (props: Props) => unknown
): ComponentInstance | null {
  const instances = host.__ASKR_INSTANCES;
  if (instances && instances.length > 0) {
    for (let index = instances.length - 1; index >= 0; index -= 1) {
      const instance = instances[index]!;
      if (instance.fn === type) {
        return instance;
      }
    }
  }

  return host.__ASKR_INSTANCE?.fn === type ? host.__ASKR_INSTANCE : null;
}

function materializeComponentResultNode(
  childInstance: ComponentInstance,
  result: unknown,
  parentNamespace?: string
): Node {
  const dom = createDOMNode(result, parentNamespace);

  if (dom instanceof Element) {
    mountInstanceInline(childInstance, dom);
    return dom;
  }

  if (!dom) {
    const placeholder = document.createComment('');
    childInstance._placeholder = placeholder;
    childInstance.mounted = true;
    childInstance.notifyUpdate = childInstance._enqueueRun!;
    childInstance.target = null;
    return placeholder;
  }

  const host = document.createElement('div') as InstanceHostElement;
  host.appendChild(dom);
  host.__ASKR_WRAPPER_HOST = true;
  mountInstanceInline(childInstance, host);
  return host;
}

function resolveNestedComponentResult(
  result: unknown,
  snapshot: ContextFrame | null
): VNode {
  let currentResult = result as VNode;
  let depth = 0;

  while (
    _isDOMElement(currentResult) &&
    typeof currentResult.type === 'function' &&
    depth < 16
  ) {
    const nestedSnapshot =
      (currentResult as ElementWithContext)[CONTEXT_FRAME_SYMBOL] ?? snapshot;
    const nestedInstance = createComponentInstance(
      nextComponentInstanceId(),
      currentResult.type as ComponentFunction,
      ((currentResult as DOMElement).props ?? {}) as Props,
      null
    );

    if (nestedSnapshot) {
      nestedInstance.ownerFrame = nestedSnapshot;
    }

    const nextResult = withContext(nestedSnapshot ?? null, () =>
      renderComponentInline(nestedInstance)
    );
    cleanupComponent(nestedInstance);

    if (nextResult instanceof Promise) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

    currentResult = nextResult as VNode;
    depth += 1;
  }

  return currentResult;
}

export function syncComponentElement(
  currentDom: Node | null,
  node: ElementWithContext,
  type: (props: Props) => unknown,
  props: Record<string, unknown>,
  parentNamespace?: string
): Node | null {
  const existingHost =
    currentDom instanceof Element ? (currentDom as InstanceHostElement) : null;
  const existingInstance = existingHost
    ? findHostInstanceByType(existingHost, type)
    : null;
  if (!existingHost || !existingInstance || existingInstance.fn !== type) {
    return null;
  }

  const snapshot =
    node[CONTEXT_FRAME_SYMBOL] ||
    getCurrentContextFrame() ||
    existingInstance.ownerFrame ||
    null;
  existingInstance.props = props || {};

  if (snapshot) {
    existingInstance.ownerFrame = snapshot;
  }

  const result = withContext(snapshot, () =>
    renderComponentInline(existingInstance)
  );
  if (result instanceof Promise) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }

  if (existingHost.__ASKR_WRAPPER_HOST) {
    for (let child = existingHost.firstChild; child; ) {
      const next = child.nextSibling;
      if (child instanceof Element) {
        cleanupDetachedComponentHost(child as InstanceHostElement);
      }
      child = next;
    }
    existingHost.textContent = '';
    const nextDom = createDOMNode(result, parentNamespace);
    if (nextDom) {
      existingHost.appendChild(nextDom);
    }
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  if (
    result &&
    typeof result === 'object' &&
    'type' in (result as DOMElement) &&
    typeof (result as DOMElement).type === 'string' &&
    tagNamesEqualIgnoreCase(
      existingHost.tagName,
      (result as DOMElement).type as string
    )
  ) {
    withContext(snapshot, () => {
      updateElementFromVnode(existingHost, result as DOMElement, true);
    });
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  const resolvedResult = resolveNestedComponentResult(result, snapshot ?? null);
  if (
    _isDOMElement(resolvedResult) &&
    typeof resolvedResult.type === 'string' &&
    tagNamesEqualIgnoreCase(existingHost.tagName, resolvedResult.type)
  ) {
    withContext(snapshot, () => {
      updateElementFromVnode(existingHost, resolvedResult, true);
    });
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  const nextDom = materializeComponentResultNode(
    existingInstance,
    result,
    parentNamespace
  );

  if (nextDom !== existingHost && existingHost.parentNode) {
    existingHost.parentNode.replaceChild(nextDom, existingHost);
    cleanupDetachedComponentHost(existingHost);
  }

  warnUnusedStateReads(existingInstance);
  return nextDom;
}

function createComponentElement(
  node: ElementWithContext,
  type: (props: Props) => unknown,
  props: Record<string, unknown>,
  parentNamespace?: string
): Node {
  // Check if this vnode has a marked context frame
  const frame = node[CONTEXT_FRAME_SYMBOL];
  const snapshot = frame || getCurrentContextFrame();

  const componentFn = type as (props: Props) => unknown;
  const isAsync = componentFn.constructor.name === 'AsyncFunction';

  if (isAsync) {
    throw new Error(
      'Async components are not supported. Use resource() for async work.'
    );
  }

  // Ensure there is a persistent instance object attached to this vnode
  let childInstance = node.__instance;
  if (!childInstance) {
    childInstance = createComponentInstance(
      nextComponentInstanceId(),
      componentFn as ComponentFunction,
      props || {},
      null
    );
    node.__instance = childInstance;
  }

  childInstance.props = props || {};

  if (snapshot) {
    childInstance.ownerFrame = snapshot;
  }

  const result = withContext(snapshot, () =>
    renderComponentInline(childInstance)
  );

  if (result instanceof Promise) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }

  const dom = withContext(snapshot, () =>
    materializeComponentResultNode(childInstance, result, parentNamespace)
  );

  warnUnusedStateReads(childInstance);

  if (dom instanceof Element) {
    materializeKey(dom, node, props);
  }
  return dom;
}

/**
 * Create a document fragment from Fragment vnode
 */
function createFragmentElement(
  node: DOMElement,
  props: Record<string, unknown>,
  parentNamespace?: string
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const children = props.children || node.children;
  if (children) {
    if (Array.isArray(children)) {
      maybeWarnMissingKeys(children);
      for (const child of children) {
        const dom = createDOMNode(child, parentNamespace);
        if (dom) fragment.appendChild(dom);
      }
    } else {
      const dom = createDOMNode(children, parentNamespace);
      if (dom) fragment.appendChild(dom);
    }
  }
  return fragment;
}

/**
 * Check if a cached DOM node can be reused for a given vnode.
 *
 * Returns true if shape has changed (i.e., DOM cannot be reused).
 * Structural check: compares DOM tagName with vnode type.
 * Do NOT rely on vnode identity (===) â€” vnodes are mutable.
 */
function checkVNodeShapeChanged(dom: Node, vnode: VNode): boolean {
  if (!_isDOMElement(vnode)) return true;
  if (!(dom instanceof Element)) return true;
  // Structural check: element type must match
  const vnodeType = (vnode as DOMElement).type;
  if (typeof vnodeType !== 'string') return true;
  return dom.tagName.toLowerCase() !== vnodeType.toLowerCase();
}

function materializeChildScopeDom(vnode: VNode): Node | null {
  if (vnode === null || vnode === undefined || vnode === false) {
    return document.createComment('');
  }

  const dom = createDOMNode(vnode);
  if (!(dom instanceof DocumentFragment)) {
    return dom;
  }

  const firstChild = dom.firstChild;
  const secondChild = firstChild?.nextSibling ?? null;
  if (!firstChild) {
    return document.createComment('');
  }
  if (secondChild) {
    throw new Error('[askr] Child scopes must render a single DOM root node.');
  }
  return firstChild;
}

function evaluateControlBoundaryState(
  controlState: ControlBoundaryState
): VNode[] {
  if (controlState.kind === 'for') {
    return evaluateForState(controlState);
  }
  if (controlState.kind === 'show') {
    return evaluateShowState(controlState);
  }
  return evaluateCaseState(controlState);
}

function clearControlBoundaryDomUpdateState(
  controlState: ControlBoundaryState
): void {
  if (controlState.kind === 'for') {
    clearForDomUpdateState(controlState);
    return;
  }
  if (controlState.kind === 'show') {
    clearShowDomUpdateState(controlState);
    return;
  }
  clearCaseDomUpdateState(controlState);
}

function getControlBoundaryState(
  node: DOMElement
): ControlBoundaryState | null {
  return (
    node._controlState ??
    (node._forState as ControlBoundaryState | undefined) ??
    null
  );
}

/**
 * Create DOM from For boundary - evaluates list and renders items
 *
 * CRITICAL INVARIANT:
 * DOM order MUST be reconstructed from the current vnode list on every render.
 * Reusing DOM nodes never implies preserving their position.
 *
 * This function ALWAYS returns a fragment whose child order exactly matches
 * the evaluated vnode list, even when all DOM nodes are reused.
 * Appending an existing node to the fragment is how we express reordering
 * (per DOM spec, appendChild moves already-attached nodes).
 *
 * Do NOT:
 * - Skip appending based on parentElement or existing attachment
 * - Rely on vnode identity (===) to decide DOM reuse (vnodes are mutable)
 * - Introduce fast-paths that might skip DOM reconstruction
 */
export function createForBoundary(
  node: DOMElement,
  props: Record<string, unknown>
): DocumentFragment {
  void props;
  const controlState = getControlBoundaryState(node);

  if (!controlState) {
    if (getRuntimeEnv().NODE_ENV !== 'production') {
      logger.warn('[Askr] Control boundary missing state');
    }
    return document.createDocumentFragment();
  }

  const childrenVNodes = evaluateControlBoundaryState(controlState);

  // DOM order MUST be reconstructed from the current vnode list on every render.
  // Reusing DOM nodes never implies preserving their position.
  const fragment = document.createDocumentFragment();

  if (controlState.kind !== 'for') {
    const activeScope = controlState.activeScope;
    const vnode = childrenVNodes[0];
    if (activeScope && vnode !== undefined) {
      const dom = materializeChildScopeDom(vnode);
      activeScope.dom = dom ?? undefined;
      if (dom) {
        fragment.appendChild(dom);
      }
    }
    clearControlBoundaryDomUpdateState(controlState);
    return fragment;
  }

  const forState = controlState;
  if (forState.orderedKeys.length === 0) {
    const fallbackScope = forState.fallbackScope;
    const fallbackVNode = childrenVNodes[0];
    if (fallbackScope && fallbackVNode !== undefined) {
      const dom = materializeChildScopeDom(fallbackVNode);
      fallbackScope.dom = dom ?? undefined;
      if (dom) {
        fragment.appendChild(dom);
      }
    }
    clearControlBoundaryDomUpdateState(controlState);
    return fragment;
  }

  for (let i = 0; i < childrenVNodes.length; i++) {
    const childVNode = childrenVNodes[i];
    // Use orderedKeys[i] to look up items â€” this is aligned with vnode order
    // after reconciliation. Do NOT use childVNode.key (JSX key may differ).
    const itemKey = forState.orderedKeys[i];
    const itemInstance = itemKey != null ? forState.items.get(itemKey) : null;

    let dom: Node | null = null;

    // Try to reuse existing DOM if element type matches (structural check).
    // Do NOT rely on vnode identity (===) â€” vnodes are mutable.
    if (itemInstance && itemInstance.scope.dom) {
      const cachedDom = itemInstance.scope.dom;
      // Structural check: element type must match for safe reuse
      if (!checkVNodeShapeChanged(cachedDom, childVNode)) {
        dom = cachedDom;
      }
    }

    // Create new DOM if no reusable node available
    if (!dom) {
      dom = materializeChildScopeDom(childVNode);
      // Cache the DOM in the item instance for future reuse
      if (itemInstance) {
        itemInstance.scope.dom = dom ?? undefined;
      }
    }

    if (dom) {
      // Always update reused DOM from current vnode (never rely on vnode identity)

      // ALWAYS append to fragment â€” this is mandatory for correct ordering.
      // Appending an existing node moves it (DOM spec) â€” this is how reordering works.
      // No parentElement checks may gate insertion.
      fragment.appendChild(dom);
    }
  }

  clearControlBoundaryDomUpdateState(controlState);
  return fragment;
}

function syncForItemDom(
  parent: Element,
  scope: {
    dom?: Node;
    needsDomUpdate: boolean;
  },
  vnode: VNode
): Node | null {
  let dom = scope.dom ?? null;

  if (dom && !scope.needsDomUpdate) {
    return dom;
  }

  if (_isDOMElement(vnode) && typeof vnode.type === 'function') {
    const syncedComponentDom = syncComponentElement(
      dom,
      vnode as ElementWithContext,
      vnode.type as (props: Props) => unknown,
      ((vnode as DOMElement).props ?? {}) as Record<string, unknown>
    );
    if (syncedComponentDom) {
      scope.dom = syncedComponentDom ?? undefined;
      return syncedComponentDom;
    }
  }

  if (!dom) {
    dom = materializeChildScopeDom(vnode);
    scope.dom = dom ?? undefined;
    return dom;
  }

  if (
    dom.nodeType === 3 &&
    (typeof vnode === 'string' || typeof vnode === 'number')
  ) {
    (dom as Text).data = String(vnode);
    return dom;
  }

  if (
    dom.nodeType === 8 &&
    (vnode === null || vnode === undefined || vnode === false)
  ) {
    return dom;
  }

  if (
    dom instanceof Element &&
    _isDOMElement(vnode) &&
    typeof vnode.type === 'string' &&
    tagNamesEqualIgnoreCase(dom.tagName, vnode.type)
  ) {
    updateElementFromVnode(dom, vnode, true);
    return dom;
  }

  const nextDom = materializeChildScopeDom(vnode);
  if (!nextDom) {
    if (dom.parentNode === parent) {
      dom.parentNode.removeChild(dom);
    }
    scope.dom = undefined;
    return null;
  }

  if (dom.parentNode === parent) {
    parent.replaceChild(nextDom, dom);
  }

  if (dom instanceof Element) {
    teardownNodeSubtree(dom);
  }

  scope.dom = nextDom;
  return nextDom;
}

function normalizeStableIntrinsicChildren(
  children: VNode | VNode[] | undefined
): VNode[] {
  if (children === null || children === undefined || children === false) {
    return [];
  }

  return Array.isArray(children) ? children : [children];
}

function getStableIntrinsicChildren(vnode: DOMElement): VNode[] {
  return normalizeStableIntrinsicChildren(
    vnode.children || (vnode.props?.children as VNode | VNode[] | undefined)
  );
}

function patchStableIntrinsicText(domNode: Node, nextVNode: VNode): boolean {
  if (
    domNode.nodeType !== 3 ||
    (typeof nextVNode !== 'string' && typeof nextVNode !== 'number')
  ) {
    return false;
  }

  const nextText = String(nextVNode);
  const textNode = domNode as Text;
  if (textNode.data !== nextText) {
    recordBenchEvent('domTextSet');
    textNode.data = nextText;
  }

  return true;
}

function patchStableIntrinsicElement(
  dom: Element,
  nextVNode: DOMElement
): boolean {
  if (
    typeof nextVNode.type !== 'string' ||
    !tagNamesEqualIgnoreCase(dom.tagName, nextVNode.type)
  ) {
    return false;
  }

  updateElementFromVnode(dom, nextVNode, false);

  const nextChildren = getStableIntrinsicChildren(nextVNode);
  if (dom.childNodes.length !== nextChildren.length) {
    return false;
  }

  for (let index = 0; index < nextChildren.length; index += 1) {
    const nextChild = nextChildren[index];

    const currentChildNode = dom.childNodes[index];
    if (!currentChildNode) {
      return false;
    }

    if (patchStableIntrinsicText(currentChildNode, nextChild)) {
      continue;
    }

    if (
      currentChildNode instanceof Element &&
      _isDOMElement(nextChild) &&
      typeof nextChild.type === 'string' &&
      patchStableIntrinsicElement(currentChildNode, nextChild)
    ) {
      continue;
    }

    return false;
  }

  return true;
}

function resolveStableIntrinsicPatchVNode(
  dom: Element,
  vnode: VNode
): DOMElement | null {
  if (!_isDOMElement(vnode)) {
    return null;
  }

  if (typeof vnode.type === 'string') {
    return tagNamesEqualIgnoreCase(dom.tagName, vnode.type) ? vnode : null;
  }

  if (typeof vnode.type !== 'function') {
    return null;
  }

  const host = dom as InstanceHostElement;
  const existingInstance = findHostInstanceByType(
    host,
    vnode.type as (props: Props) => unknown
  );
  if (
    !existingInstance ||
    existingInstance.fn !== vnode.type ||
    host.__ASKR_WRAPPER_HOST
  ) {
    return null;
  }

  const snapshot =
    (vnode as ElementWithContext)[CONTEXT_FRAME_SYMBOL] ||
    getCurrentContextFrame() ||
    existingInstance.ownerFrame ||
    null;

  existingInstance.props =
    (((vnode as DOMElement).props ?? {}) as Record<string, unknown>) || {};

  if (snapshot) {
    existingInstance.ownerFrame = snapshot;
  }

  const result = withContext(snapshot, () =>
    renderComponentInline(existingInstance)
  );
  if (result instanceof Promise) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }

  const resolvedResult = resolveNestedComponentResult(result, snapshot ?? null);
  if (
    _isDOMElement(resolvedResult) &&
    typeof resolvedResult.type === 'string' &&
    tagNamesEqualIgnoreCase(dom.tagName, resolvedResult.type)
  ) {
    return resolvedResult;
  }

  return null;
}

function tryPatchStableForDirtyItem(scope: {
  dom?: Node;
  vnode?: VNode;
}): boolean {
  if (!(scope.dom instanceof Element) || scope.vnode === undefined) {
    return false;
  }

  const nextIntrinsic = resolveStableIntrinsicPatchVNode(
    scope.dom,
    scope.vnode
  );
  if (!nextIntrinsic) {
    return false;
  }

  const didPatch = patchStableIntrinsicElement(scope.dom, nextIntrinsic);

  const existingInstance = (scope.dom as InstanceHostElement).__ASKR_INSTANCE;
  if (didPatch && existingInstance) {
    warnUnusedStateReads(existingInstance);
  }

  return didPatch;
}

function removeForBoundaryNodes(parent: Element, removedNodes: Node[]): void {
  if (
    removedNodes.length > 0 &&
    removedNodes.length === parent.childNodes.length
  ) {
    let canBulkClear = true;
    for (let i = 0; i < removedNodes.length; i++) {
      if (removedNodes[i].parentNode !== parent) {
        canBulkClear = false;
        break;
      }
    }

    if (canBulkClear) {
      for (let i = 0; i < removedNodes.length; i++) {
        recordBenchEvent('domRemove');
      }
      withBenchMetricScope('fullClear', () => {
        recordBenchCounter('bulkClearCommits');
        removeAllListeners(parent);
        parent.textContent = '';
      });
      return;
    }
  }

  for (let i = 0; i < removedNodes.length; i++) {
    const node = removedNodes[i];
    if (node.parentNode === parent) {
      recordBenchEvent('domRemove');
      parent.removeChild(node);
    }
  }
}

function syncKeyedMapFromForState(
  parent: Element,
  forState: ForState<unknown>,
  strategy: ForCommitStrategy,
  removedNodes: Node[]
): void {
  const existing = keyedElements.get(parent);
  const ensureMapEntry = (
    map: Map<string | number, Element>,
    key: string | number,
    element: Element
  ): void => {
    map.set(key, element);
    const keyString = String(key);
    map.set(keyString, element);
    const keyNumber = Number(keyString);
    if (!Number.isNaN(keyNumber)) {
      map.set(keyNumber, element);
    }
  };

  if (strategy === 'SWAP') {
    if (existing) {
      return;
    }
  }

  if (strategy === 'NO_REORDER') {
    if (existing && removedNodes.length === 0) {
      return;
    }

    if (existing) {
      for (const [mapKey, element] of existing) {
        if (element.parentNode !== parent) {
          existing.delete(mapKey);
        }
      }

      if (existing.size > 0) {
        keyedElements.set(parent, existing);
      } else {
        keyedElements.delete(parent);
      }
      return;
    }
  }

  if (strategy === 'TRUNCATE' && forState.orderedKeys.length === 0) {
    if (existing) {
      existing.clear();
    }
    keyedElements.delete(parent);
    return;
  }

  if (strategy === 'APPEND' && existing) {
    for (let i = 0; i < forState.orderedKeys.length; i++) {
      const key = forState.orderedKeys[i];
      if (key === null || existing.has(key)) continue;
      const itemInstance = forState.items.get(key);
      if (itemInstance?.scope.dom instanceof Element) {
        ensureMapEntry(existing, key, itemInstance.scope.dom);
      }
    }

    if (existing.size > 0) {
      keyedElements.set(parent, existing);
    } else {
      keyedElements.delete(parent);
    }
    return;
  }

  const nextMap = existing ?? new Map<string | number, Element>();
  nextMap.clear();

  for (let i = 0; i < forState.orderedKeys.length; i++) {
    const key = forState.orderedKeys[i];
    if (key === null) continue;
    const itemInstance = forState.items.get(key);
    if (itemInstance?.scope.dom instanceof Element) {
      ensureMapEntry(nextMap, key, itemInstance.scope.dom);
    }
  }

  if (nextMap.size > 0) {
    keyedElements.set(parent, nextMap);
  } else {
    keyedElements.delete(parent);
  }
}

export function commitForBoundaryChildren(
  parent: Element,
  controlState: ControlBoundaryState,
  childrenVNodes: VNode[]
): void {
  if (controlState.kind !== 'for') {
    const activeScope = controlState.activeScope;
    const activeVNode = childrenVNodes[0];
    const nextDom =
      activeScope && activeVNode !== undefined
        ? syncForItemDom(parent, activeScope, activeVNode)
        : null;

    for (let i = 0; i < controlState.lastRemovedNodes.length; i++) {
      const removedNode = controlState.lastRemovedNodes[i];
      if (removedNode instanceof Element) {
        teardownNodeSubtree(removedNode);
      }
      if (removedNode.parentNode === parent) {
        recordBenchEvent('domRemove');
        parent.removeChild(removedNode);
      }
    }

    if (nextDom) {
      if (
        parent.childNodes.length !== 1 ||
        parent.firstChild !== nextDom ||
        controlState.lastRemovedNodes.length > 0
      ) {
        parent.replaceChildren(nextDom);
      }
    } else if (parent.firstChild) {
      parent.textContent = '';
    }

    keyedElements.delete(parent);
    clearControlBoundaryDomUpdateState(controlState);
    return;
  }

  const forState = controlState;
  const domCommitStart = performance.now();

  if (forState.orderedKeys.length === 0) {
    removeForBoundaryNodes(parent, forState.lastRemovedNodes);

    const fallbackScope = forState.fallbackScope;
    const fallbackVNode = childrenVNodes[0];
    const nextDom =
      fallbackScope && fallbackVNode !== undefined
        ? syncForItemDom(parent, fallbackScope, fallbackVNode)
        : null;

    if (nextDom) {
      if (
        parent.childNodes.length !== 1 ||
        parent.firstChild !== nextDom ||
        forState.lastRemovedNodes.length > 0
      ) {
        parent.replaceChildren(nextDom);
      }
    } else if (parent.firstChild) {
      parent.textContent = '';
    }

    keyedElements.delete(parent);
    recordBenchTiming('domCommit', performance.now() - domCommitStart);
    clearForDomUpdateState(forState);
    return;
  }

  const commitDirtyNoReorder = (): void => {
    const dirtyIndices = forState.pendingDirtyIndices;
    if (!dirtyIndices || dirtyIndices.length === 0) {
      return;
    }

    for (let dirtyIndex = 0; dirtyIndex < dirtyIndices.length; dirtyIndex++) {
      const i = dirtyIndices[dirtyIndex];
      const itemKey = forState.orderedKeys[i];
      const itemInstance = forState.items.get(itemKey);
      if (!itemInstance) {
        continue;
      }

      if (tryPatchStableForDirtyItem(itemInstance.scope)) {
        continue;
      }

      const dom = syncForItemDom(parent, itemInstance.scope, childrenVNodes[i]);
      if (!dom) {
        continue;
      }

      if (dom.parentNode !== parent) {
        const anchor = parent.childNodes[i] ?? null;
        recordBenchEvent('domInsert');
        parent.insertBefore(dom, anchor);
      }
    }
  };

  const commitPositional = (): void => {
    for (let i = 0; i < forState.orderedKeys.length; i++) {
      const itemKey = forState.orderedKeys[i];
      const itemInstance = forState.items.get(itemKey);
      if (!itemInstance) {
        continue;
      }

      const dom = syncForItemDom(parent, itemInstance.scope, childrenVNodes[i]);
      if (!dom) {
        continue;
      }

      if (dom.parentNode !== parent) {
        const anchor = parent.childNodes[i] ?? null;
        recordBenchEvent('domInsert');
        parent.insertBefore(dom, anchor);
      }
    }
  };

  const commitAppend = (): void => {
    withBenchMetricScope('coldCreate', () => {
      const fragment = parent.ownerDocument.createDocumentFragment();
      let hasPendingAppend = false;

      for (let i = 0; i < forState.orderedKeys.length; i++) {
        const itemKey = forState.orderedKeys[i];
        const itemInstance = forState.items.get(itemKey);
        if (!itemInstance) {
          continue;
        }

        // Skip already-mounted clean items without calling syncForItemDom.
        // This avoids redundant DOM reads for unchanged rows when appending to
        // an existing list (e.g. append 1,000 rows to 1,000-row table).
        if (
          itemInstance.scope.dom?.parentNode === parent &&
          !itemInstance.scope.needsDomUpdate
        ) {
          continue;
        }

        const dom = syncForItemDom(
          parent,
          itemInstance.scope,
          childrenVNodes[i]
        );
        if (!dom) {
          continue;
        }

        if (dom.parentNode !== parent) {
          recordBenchEvent('domInsert');
          fragment.appendChild(dom);
          hasPendingAppend = true;
        }
      }

      if (hasPendingAppend) {
        parent.appendChild(fragment);
      }
    });
  };

  const commitSwap = (): void => {
    const swapIndices = forState.pendingSwapIndices;
    if (!swapIndices) {
      return;
    }

    let [firstIndex, secondIndex] = swapIndices;
    if (firstIndex === secondIndex) {
      return;
    }

    if (firstIndex > secondIndex) {
      [firstIndex, secondIndex] = [secondIndex, firstIndex];
    }

    const firstKey = forState.orderedKeys[firstIndex];
    const secondKey = forState.orderedKeys[secondIndex];
    const firstItem = forState.items.get(firstKey);
    const secondItem = forState.items.get(secondKey);

    if (!firstItem || !secondItem) {
      commitReorder();
      return;
    }

    const firstDom = syncForItemDom(
      parent,
      firstItem.scope,
      childrenVNodes[firstIndex]
    );
    const secondDom = syncForItemDom(
      parent,
      secondItem.scope,
      childrenVNodes[secondIndex]
    );

    if (!firstDom || !secondDom) {
      commitReorder();
      return;
    }

    if (firstDom.parentNode !== parent || secondDom.parentNode !== parent) {
      commitReorder();
      return;
    }

    // orderedKeys already reflects target order: firstDom should appear before
    // secondDom at [firstIndex, secondIndex]. If DOM already matches that
    // relative order, we only needed vnode/prop sync above.
    const firstBeforeSecond =
      (firstDom.compareDocumentPosition(secondDom) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;
    if (firstBeforeSecond) {
      return;
    }

    // Swap by moving firstDom into secondDom's slot, then placing secondDom
    // where firstDom used to be. This handles adjacent and non-adjacent nodes.
    const firstNextSibling = firstDom.nextSibling;
    recordBenchEvent('domMove');
    parent.insertBefore(firstDom, secondDom);
    recordBenchEvent('domMove');
    parent.insertBefore(secondDom, firstNextSibling);
  };

  const commitReorder = (): void => {
    const keys = forState.orderedKeys;
    const count = keys.length;

    if (forState.pendingMoveOnly && forState.lastRemovedNodes.length === 0) {
      const frag = parent.ownerDocument.createDocumentFragment();

      for (let i = 0; i < count; i++) {
        const itemKey = keys[i];
        const itemInstance = forState.items.get(itemKey);
        const dom = itemInstance?.scope.dom;
        if (!dom) {
          return;
        }
        recordBenchEvent(dom.parentNode === parent ? 'domMove' : 'domInsert');
        frag.appendChild(dom);
      }

      parent.replaceChildren(frag);
      return;
    }

    // Fast path: when no existing item is already a child of parent (pure
    // creation or full-replace scenario), sync all DOM nodes and commit
    // atomically with a single replaceChildren instead of N insertBefore calls.
    let hasExistingChild = false;
    for (let i = 0; i < count; i++) {
      const inst = forState.items.get(keys[i]);
      if (inst?.scope.dom?.parentNode === parent) {
        hasExistingChild = true;
        break;
      }
    }

    if (!hasExistingChild) {
      withBenchMetricScope('coldCreate', () => {
        const frag = parent.ownerDocument.createDocumentFragment();
        for (let i = 0; i < count; i++) {
          const itemKey = keys[i];
          const itemInstance = forState.items.get(itemKey);
          if (!itemInstance) continue;
          const dom = syncForItemDom(
            parent,
            itemInstance.scope,
            childrenVNodes[i]
          );
          if (dom) {
            recordBenchEvent('domInsert');
            frag.appendChild(dom);
          }
        }
        recordBenchCounter('replaceChildrenCommits');
        parent.replaceChildren(frag);
      });
      return;
    }

    if (forState.lastRemovedNodes.length === 0) {
      const frag = parent.ownerDocument.createDocumentFragment();

      for (let i = 0; i < count; i++) {
        const itemKey = keys[i];
        const itemInstance = forState.items.get(itemKey);
        if (!itemInstance) {
          continue;
        }

        const dom = syncForItemDom(
          parent,
          itemInstance.scope,
          childrenVNodes[i]
        );
        if (!dom) {
          continue;
        }

        recordBenchEvent(dom.parentNode === parent ? 'domMove' : 'domInsert');
        frag.appendChild(dom);
      }

      parent.replaceChildren(frag);
      return;
    }

    for (let i = 0; i < count; i++) {
      const itemKey = keys[i];
      const itemInstance = forState.items.get(itemKey);
      if (!itemInstance) {
        continue;
      }

      const dom = syncForItemDom(parent, itemInstance.scope, childrenVNodes[i]);
      if (!dom) {
        continue;
      }

      const anchor = parent.childNodes[i] ?? null;
      if (dom !== anchor) {
        recordBenchEvent('domMove');
        parent.insertBefore(dom, anchor);
      }
    }
  };

  switch (forState.lastCommitStrategy) {
    case 'NO_REORDER':
      commitDirtyNoReorder();
      break;
    case 'TRUNCATE':
      commitPositional();
      break;
    case 'APPEND':
      commitAppend();
      break;
    case 'SWAP':
      commitSwap();
      break;
    case 'FULL_KEYED':
    default:
      commitReorder();
      break;
  }

  removeForBoundaryNodes(parent, forState.lastRemovedNodes);
  syncKeyedMapFromForState(
    parent,
    forState,
    forState.lastCommitStrategy,
    forState.lastRemovedNodes
  );
  recordBenchTiming('domCommit', performance.now() - domCommitStart);
  clearForDomUpdateState(forState);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Element Updates
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Update an existing element's attributes and children from vnode
 */
export function updateElementFromVnode(
  el: Element,
  vnode: VNode,
  updateChildren = true
): void {
  if (!_isDOMElement(vnode)) {
    return;
  }

  const props = (vnode.props || {}) as Record<string, unknown>;

  if (isHydrationSkipped(el)) {
    clearHydrationDeferredSubtree(el);
    return;
  }

  // Ensure key is materialized
  materializeKey(el, vnode, props);

  // Diff and update event listeners and other attributes
  const existingListeners = elementListeners.get(el);
  const existingReactiveProps = elementReactivePropsCleanup.get(el);

  // Fast path: when element has no tracked listeners/reactive props and all
  // static scalar props already match, skip full prop diff machinery.
  if (
    (!existingListeners || existingListeners.size === 0) &&
    (!existingReactiveProps || existingReactiveProps.size === 0)
  ) {
    let staticPropCount = 0;
    let canSkipPropDiff = true;

    for (const key in props) {
      if (isSkippedProp(key)) continue;
      const value = props[key];
      if (value === undefined || value === null || value === false) {
        canSkipPropDiff = false;
        break;
      }

      const eventName = parseEventName(key);
      if (eventName || typeof value === 'function') {
        canSkipPropDiff = false;
        break;
      }

      if (key === 'class' || key === 'className') {
        if (readElementClassName(el) !== String(value)) {
          canSkipPropDiff = false;
          break;
        }
        staticPropCount++;
        continue;
      }

      if (key === 'value' || key === 'checked') {
        if ((el as HTMLElement & Record<string, unknown>)[key] !== value) {
          canSkipPropDiff = false;
          break;
        }
        staticPropCount++;
        continue;
      }

      if (el.getAttribute(key) !== String(value)) {
        canSkipPropDiff = false;
        break;
      }
      staticPropCount++;
    }

    // Avoid skipping when the element has extra attributes that would need removal.
    if (canSkipPropDiff && el.attributes.length === staticPropCount) {
      if (updateChildren) {
        const children =
          vnode.children || (props.children as VNode | VNode[] | undefined);
        updateElementChildren(el, children);
      }
      return;
    }
  }

  // Lazily materialize desired event names only if we need to diff against existing listeners.
  // This avoids allocating a Set for the common case (no listeners, or no event props).
  let desiredEventNames: Set<string> | null = null;
  let desiredReactivePropNames: Set<string> | null = null;

  for (const key in props) {
    const value = props[key];
    if (isSkippedProp(key)) continue;

    const eventName = parseEventName(key);

    // Handle removal cases
    if (value === undefined || value === null || value === false) {
      if (key === 'class' || key === 'className') {
        writeElementClassName(el, '');
      } else if (eventName && existingListeners?.has(eventName)) {
        const entry = existingListeners.get(eventName)!;
        if (entry.isDelegated) {
          removeDelegatedListener(el, eventName);
        } else {
          if (entry.options !== undefined) {
            el.removeEventListener(eventName, entry.handler, entry.options);
          } else {
            el.removeEventListener(eventName, entry.handler);
          }
        }
        existingListeners.delete(eventName);
      } else {
        const entry = existingReactiveProps?.get(key);
        if (entry) {
          entry.cleanup();
          existingReactiveProps?.delete(key);
        } else {
          el.removeAttribute(key);
        }
      }
      continue;
    }

    // Handle reactive props (functions)
    if (typeof value === 'function' && !eventName && key !== 'ref') {
      const existingEntry = existingReactiveProps?.get(key);
      if (existingReactiveProps && existingReactiveProps.size > 0) {
        (desiredReactivePropNames ??= new Set()).add(key);
      }

      // Only cleanup and re-setup if function reference changed (Issue 1 fix)
      if (existingEntry && existingEntry.fnRef === value) {
        // Same function reference, no need to re-setup
        continue;
      }

      if (existingEntry?.updateFn) {
        existingEntry.updateFn(value as () => unknown);
        existingEntry.fnRef = value as () => unknown;
        continue;
      }

      // If function reference changed, cleanup old and setup new
      if (existingEntry) {
        existingEntry.cleanup();
      }

      const reactive = setupReactiveProp(
        el,
        key,
        value as () => unknown,
        vnode.type as string
      );

      if (!elementReactivePropsCleanup.has(el)) {
        elementReactivePropsCleanup.set(el, new Map());
      }
      elementReactivePropsCleanup.get(el)!.set(key, {
        cleanup: reactive.cleanup,
        updateFn: reactive.updateFn,
        fnRef: value as () => unknown,
      });
      continue;
    }

    const existingReactiveEntry = existingReactiveProps?.get(key);
    if (existingReactiveEntry) {
      existingReactiveEntry.cleanup();
      existingReactiveProps?.delete(key);
    }

    if (key === 'class' || key === 'className') {
      writeElementClassName(el, String(value));
    } else if (key === 'value' || key === 'checked') {
      (el as HTMLElement & Record<string, unknown>)[key] = value;
    } else if (eventName) {
      const useDelegation =
        isEventDelegationEnabled() && isDelegatedEvent(eventName);
      (desiredEventNames ??= new Set()).add(eventName);

      if (useDelegation) {
        const existingDelegated = getDelegatedHandlerForElement(el, eventName);
        if (existingDelegated?.original === value) {
          continue;
        }

        if (
          existingDelegated &&
          updateDelegatedListener(
            el,
            eventName,
            value as EventListener,
            value as EventListener,
            undefined
          )
        ) {
          continue;
        }

        addDelegatedListener(
          el,
          eventName,
          value as EventListener,
          value as EventListener,
          undefined
        );
        continue;
      }

      const existing = existingListeners?.get(eventName);

      if (existing && existing.original === value) {
        continue;
      }

      if (existing) {
        if (
          useDelegation &&
          existing.isDelegated &&
          updateDelegatedListener(
            el,
            eventName,
            value as EventListener,
            value as EventListener,
            undefined
          )
        ) {
          existing.handler = value as EventListener;
          existing.original = value as EventListener;
          existing.options = undefined;
          continue;
        }

        if (!useDelegation && !existing.isDelegated && existing.updateHandler) {
          existing.updateHandler(value as EventListener);
          existing.original = value as EventListener;
          continue;
        }

        if (existing.isDelegated) {
          removeDelegatedListener(el, eventName);
        } else {
          if (existing.options !== undefined) {
            el.removeEventListener(
              eventName,
              existing.handler,
              existing.options
            );
          } else {
            el.removeEventListener(eventName, existing.handler);
          }
        }
      }

      const options = getPassiveOptions(eventName);
      const mutableHandler = createMutableWrappedHandler(
        value as EventListener,
        true
      );
      const trackedHandler = mutableHandler.handler;

      if (options !== undefined) {
        el.addEventListener(eventName, trackedHandler, options);
      } else {
        el.addEventListener(eventName, trackedHandler);
      }

      const listenerEntry = {
        handler: trackedHandler,
        original: value as EventListener,
        options,
        isDelegated: false,
        updateHandler: mutableHandler?.updateHandler,
      };
      if (!elementListeners.has(el)) {
        elementListeners.set(el, new Map());
      }
      elementListeners.get(el)!.set(eventName, listenerEntry);
    } else {
      el.setAttribute(key, String(value));
    }
  }

  if (existingListeners && existingListeners.size > 0) {
    // If no event props were present, all existing listeners are undesired.
    if (desiredEventNames === null) {
      existingListeners.forEach((entry, eventName) => {
        if (entry.isDelegated) {
          removeDelegatedListener(el, eventName);
        } else {
          if (entry.options !== undefined) {
            el.removeEventListener(eventName, entry.handler, entry.options);
          } else {
            el.removeEventListener(eventName, entry.handler);
          }
        }
      });
      elementListeners.delete(el);
    } else {
      existingListeners.forEach((entry, eventName) => {
        if (!desiredEventNames.has(eventName)) {
          if (entry.isDelegated) {
            removeDelegatedListener(el, eventName);
          } else {
            if (entry.options !== undefined) {
              el.removeEventListener(eventName, entry.handler, entry.options);
            } else {
              el.removeEventListener(eventName, entry.handler);
            }
          }
          existingListeners.delete(eventName);
        }
      });
      if (existingListeners.size === 0) elementListeners.delete(el);
    }
  }

  const delegatedHandlers = getDelegatedHandlersForElement(el);
  if (delegatedHandlers && delegatedHandlers.size > 0) {
    if (desiredEventNames === null) {
      for (const eventName of delegatedHandlers.keys()) {
        removeDelegatedListener(el, eventName);
      }
    } else {
      for (const eventName of delegatedHandlers.keys()) {
        if (!desiredEventNames.has(eventName)) {
          removeDelegatedListener(el, eventName);
        }
      }
    }
  }

  if (existingReactiveProps && existingReactiveProps.size > 0) {
    if (desiredReactivePropNames === null) {
      existingReactiveProps.forEach((entry) => {
        entry.cleanup();
      });
      elementReactivePropsCleanup.delete(el);
    } else {
      existingReactiveProps.forEach((entry, key) => {
        if (!desiredReactivePropNames.has(key)) {
          entry.cleanup();
          existingReactiveProps.delete(key);
        }
      });
      if (existingReactiveProps.size === 0) {
        elementReactivePropsCleanup.delete(el);
      }
    }
  }

  // Update children
  if (updateChildren) {
    const children =
      vnode.children || (props.children as VNode | VNode[] | undefined);
    updateElementChildren(el, children);
  }
}

export function updateElementChildren(
  el: Element,
  children: VNode | VNode[] | undefined
): void {
  // CRITICAL: Check for null/undefined explicitly, not falsy values
  // because 0, false, and '' are valid children
  if (children === null || children === undefined) {
    // Clean up all children before clearing
    for (let n = el.firstChild; n; ) {
      const next = n.nextSibling;
      if (n instanceof Element) {
        teardownNodeSubtree(n);
      }
      n = next;
    }
    el.textContent = '';
    return;
  }

  // Handle direct For boundary vnode (non-array) before generic scalar/non-array handling.
  if (
    !Array.isArray(children) &&
    _isDOMElement(children) &&
    (children as DOMElement).type === __FOR_BOUNDARY__
  ) {
    const controlVnode = children as DOMElement;
    const controlState = getControlBoundaryState(controlVnode);
    if (!controlState) {
      throw new Error(
        '[updateElementChildren] Control boundary missing internal state'
      );
    }
    const childrenVNodes = evaluateControlBoundaryState(controlState);
    commitForBoundaryChildren(el, controlState, childrenVNodes as VNode[]);
    return;
  }

  if (
    !Array.isArray(children) &&
    (typeof children === 'string' || typeof children === 'number')
  ) {
    if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
      const s = String(children);
      const t = el.firstChild as Text;
      // Skip the write when the text is already correct â€” avoids triggering
      // DOM mutation observers and text layout passes for unchanged nodes.
      if (t.data !== s) t.data = s;
    } else {
      // Clean up all children before replacing with text
      for (let n = el.firstChild; n; ) {
        const next = n.nextSibling;
        if (n instanceof Element) {
          teardownNodeSubtree(n);
        }
        n = next;
      }
      el.textContent = String(children);
    }
    return;
  }

  // Handle For boundary wrapped in single-element array
  if (
    Array.isArray(children) &&
    children.length === 1 &&
    _isDOMElement(children[0]) &&
    (children[0] as DOMElement).type === __FOR_BOUNDARY__
  ) {
    const controlVnode = children[0] as DOMElement;
    const controlState = getControlBoundaryState(controlVnode);
    if (!controlState) {
      throw new Error(
        '[updateElementChildren] Control boundary missing internal state'
      );
    }
    const childrenVNodes = evaluateControlBoundaryState(controlState);
    commitForBoundaryChildren(el, controlState, childrenVNodes as VNode[]);
    return;
  }

  if (Array.isArray(children)) {
    updateUnkeyedChildren(el, children as unknown[]);
    return;
  }

  if (_isDOMElement(children)) {
    updateUnkeyedChildren(el, [children]);
    return;
  }

  // Clean up all children before clearing
  for (let n = el.firstChild; n; ) {
    const next = n.nextSibling;
    if (n instanceof Element) {
      teardownNodeSubtree(n);
    }
    n = next;
  }
  el.textContent = '';
  const dom = createDOMNode(children);
  if (dom) el.appendChild(dom);
}

export function updateUnkeyedChildren(
  parent: Element,
  newChildren: unknown[]
): void {
  const parentNamespace =
    parent.namespaceURI === SVG_NAMESPACE ? SVG_NAMESPACE : undefined;

  const trySyncComponentChild = (
    currentDom: Element,
    next: DOMElement
  ): Node | null => {
    if (typeof next.type !== 'function') {
      return null;
    }

    return syncComponentElement(
      currentDom,
      next as ElementWithContext,
      next.type as (props: Props) => unknown,
      (((next as DOMElement).props ?? {}) as Record<string, unknown>) || {},
      parentNamespace
    );
  };

  // Check if newChildren has mixed content (both text/primitives and elements)
  const hasText = newChildren.some(
    (c) => typeof c === 'string' || typeof c === 'number'
  );
  const hasElements = newChildren.some((c) => _isDOMElement(c));

  // Fast path: same-count, pure-element update (the common large-list re-render).
  // Iterate parent.children by index directly to avoid the Array.from snapshot
  // allocation for large lists. replaceChild(x, child[i]) replaces in-place so
  // subsequent indices in the live HTMLCollection do NOT shift â€” safe to use.
  if (
    !hasText &&
    hasElements &&
    parent.children.length === newChildren.length
  ) {
    const c = parent.children;
    for (let i = 0; i < newChildren.length; i++) {
      const next = newChildren[i];
      const current = c[i];
      if (!current || next === undefined) continue;
      if (_isDOMElement(next) && typeof next.type === 'string') {
        if (tagsEqualIgnoreCase(current.tagName, next.type)) {
          updateElementFromVnode(current, next);
        } else {
          const dom = createDOMNode(next);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else if (_isDOMElement(next)) {
        const synced = trySyncComponentChild(current, next);
        if (synced && synced !== current) {
          teardownNodeSubtree(current);
        } else if (!synced) {
          const dom = createDOMNode(next);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else {
        const dom = createDOMNode(next);
        if (dom) {
          teardownNodeSubtree(current);
          parent.replaceChild(dom, current);
        }
      }
    }
    return;
  }

  const existing = Array.from(parent.children);

  // If we have mixed content (text + elements), use childNodes instead of children
  // to handle both text nodes and elements properly
  if (hasText && hasElements) {
    const allNodes = Array.from(parent.childNodes);
    const max = Math.max(allNodes.length, newChildren.length);

    for (let i = 0; i < max; i++) {
      const currentNode = allNodes[i];
      const next = newChildren[i];

      // Remove extra existing nodes
      if (next === undefined && currentNode) {
        teardownNodeSubtree(currentNode);
        currentNode.remove();
        continue;
      }

      // Append new children beyond existing length
      if (!currentNode && next !== undefined) {
        const dom = createDOMNode(next);
        if (dom) parent.appendChild(dom);
        continue;
      }

      if (!currentNode || next === undefined) continue;

      // Update existing node based on next vnode/primitive
      if (typeof next === 'string' || typeof next === 'number') {
        // New child is text
        if (currentNode.nodeType === 3) {
          // Existing is text node - update it
          (currentNode as Text).data = String(next);
        } else {
          // Existing is element - replace with text node
          const textNode = document.createTextNode(String(next));
          parent.replaceChild(textNode, currentNode);
        }
      } else if (_isDOMElement(next)) {
        // New child is element
        if (currentNode.nodeType === 1) {
          // Existing is element
          const currentEl = currentNode as Element;
          if (typeof next.type === 'string') {
            if (tagsEqualIgnoreCase(currentEl.tagName, next.type)) {
              // Same type - update in place
              updateElementFromVnode(currentEl, next);
            } else {
              // Different type - replace
              const dom = createDOMNode(next);
              if (dom) {
                teardownNodeSubtree(currentEl);
                parent.replaceChild(dom, currentNode);
              }
            }
          } else {
            const synced = trySyncComponentChild(currentEl, next);
            if (synced && synced !== currentNode) {
              teardownNodeSubtree(currentEl);
            } else if (!synced) {
              const dom = createDOMNode(next);
              if (dom) {
                teardownNodeSubtree(currentEl);
                parent.replaceChild(dom, currentNode);
              }
            }
          }
        } else {
          // Existing is text node - replace with element
          const dom = createDOMNode(next);
          if (dom) parent.replaceChild(dom, currentNode);
        }
      }
    }
    return;
  }

  // Special case: if we have a single text/number child and the parent has a single text node,
  // update the text node in place to preserve identity
  if (
    newChildren.length === 1 &&
    existing.length === 0 &&
    parent.childNodes.length === 1
  ) {
    const firstNewChild = newChildren[0];
    const firstExisting = parent.firstChild;
    if (
      (typeof firstNewChild === 'string' ||
        typeof firstNewChild === 'number') &&
      firstExisting?.nodeType === 3 // Text node
    ) {
      (firstExisting as Text).data = String(firstNewChild);
      return;
    }
  }

  // If there are only text nodes (no element children), clear before updating
  if (existing.length === 0 && parent.childNodes.length > 0) {
    // Clean up all children before clearing
    for (let n = parent.firstChild; n; ) {
      const next = n.nextSibling;
      if (n instanceof Element) {
        teardownNodeSubtree(n);
      }
      n = next;
    }
    parent.textContent = '';
  }
  const max = Math.max(existing.length, newChildren.length);

  for (let i = 0; i < max; i++) {
    const current = existing[i];
    const next = newChildren[i];

    // Remove extra existing children
    if (next === undefined && current) {
      // Clean up any component instance mounted on this node
      teardownNodeSubtree(current);
      current.remove();
      continue;
    }

    // Append new children beyond existing length
    if (!current && next !== undefined) {
      const dom = createDOMNode(next);
      if (dom) parent.appendChild(dom);
      continue;
    }

    if (!current || next === undefined) continue;

    // Update existing element based on next vnode/primitive
    if (typeof next === 'string' || typeof next === 'number') {
      // Clean up any element children before replacing with text
      if (current instanceof Element && current.childNodes.length > 0) {
        for (let n = current.firstChild; n; ) {
          const nextNode = n.nextSibling;
          if (n instanceof Element) {
            teardownNodeSubtree(n);
          }
          n = nextNode;
        }
      }
      current.textContent = String(next);
    } else if (_isDOMElement(next)) {
      if (typeof next.type === 'string') {
        // If element type matches, update in place; otherwise replace
        if (tagsEqualIgnoreCase(current.tagName, next.type)) {
          updateElementFromVnode(current, next);
        } else {
          const dom = createDOMNode(next);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else {
        const synced = trySyncComponentChild(current, next);
        if (synced && synced !== current) {
          teardownNodeSubtree(current);
        } else if (!synced) {
          const dom = createDOMNode(next);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      }
    } else {
      // Fallback for other types: replace
      const dom = createDOMNode(next);
      if (dom) {
        teardownNodeSubtree(current);
        parent.replaceChild(dom, current);
      }
    }
  }
}

/**
 * Positional update for keyed lists where keys changed en-masse but structure
 * (element tags and simple text children) remains identical. This updates
 * text content in-place and remaps the `data-key` attribute to the new key so
 * subsequent updates can find elements by their data-key.
 */
export function performBulkPositionalKeyedTextUpdate(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
) {
  const total = keyedVnodes.length;
  let reused = 0;
  let updatedKeys = 0;
  const t0 = now();
  const env = getRuntimeEnv();
  const debugFastPath =
    env.ASKR_FASTPATH_DEBUG === '1' || env.ASKR_FASTPATH_DEBUG === 'true';

  for (let i = 0; i < total; i++) {
    const { key, vnode } = keyedVnodes[i];
    const ch = parent.children[i] as Element | undefined;

    if (
      ch &&
      _isDOMElement(vnode) &&
      typeof (vnode as DOMElement).type === 'string'
    ) {
      const vnodeType = (vnode as DOMElement).type as string;

      if (tagsEqualIgnoreCase(ch.tagName, vnodeType)) {
        const children =
          (vnode as DOMElement).children ||
          (vnode as DOMElement).props?.children;

        if (debugFastPath) {
          logFastPathDebug('positional idx', i, {
            chTag: ch.tagName,
            vnodeType,
            chChildNodes: ch.childNodes.length,
            childrenType: Array.isArray(children) ? 'array' : typeof children,
          });
        }

        updateTextContent(ch, children, vnode as DOMElement);
        setDataKey(ch, key, () => updatedKeys++);
        reused++;
        continue;
      } else {
        if (debugFastPath) {
          logFastPathDebug('positional tag mismatch', i, {
            chTag: ch.tagName,
            vnodeType,
          });
        }
      }
    } else {
      if (debugFastPath) {
        logFastPathDebug('positional missing or invalid', i, { ch: !!ch });
      }
    }

    // Fallback: replace the node at position i
    replaceNodeAtPosition(parent, i, vnode);
  }

  const t = now() - t0;
  updateKeyedElementsMap(parent, keyedVnodes);

  const stats = { n: total, reused, updatedKeys, t } as const;
  recordFastPathStats(stats, 'bulkKeyedPositionalHits');

  return stats;
}

/** Update text content of element from children prop */
function updateTextContent(
  el: Element,
  children: unknown,
  vnode: DOMElement
): void {
  if (typeof children === 'string' || typeof children === 'number') {
    setTextNodeData(el, String(children));
    if (vnode.props && hasNonTrivialProps(vnode.props)) {
      updateElementFromVnode(el, vnode, false);
    }
  } else if (
    Array.isArray(children) &&
    children.length === 1 &&
    (typeof children[0] === 'string' || typeof children[0] === 'number')
  ) {
    setTextNodeData(el, String(children[0]));
    if (vnode.props && hasNonTrivialProps(vnode.props)) {
      updateElementFromVnode(el, vnode, false);
    }
  } else {
    // For more complex child shapes, try a small specialized text update before
    // falling back to a real vnode-driven update.
    if (!tryUpdateTwoChildTextPattern(el, vnode)) {
      updateElementFromVnode(el, vnode);
    }
  }
}

// Common keyed-list pattern in benches:
// <div> [ <span>text</span>, <p>text</p> ]
// Update text nodes in place without running a full vnode diff.
function tryUpdateTwoChildTextPattern(
  parentEl: Element,
  vnode: DOMElement
): boolean {
  const vnodeChildren = vnode.children || vnode.props?.children;
  if (!Array.isArray(vnodeChildren) || vnodeChildren.length !== 2) return false;

  const c0 = vnodeChildren[0];
  const c1 = vnodeChildren[1];
  if (!_isDOMElement(c0) || !_isDOMElement(c1)) return false;
  if (typeof c0.type !== 'string' || typeof c1.type !== 'string') return false;

  const el0 = parentEl.children[0] as Element | undefined;
  const el1 = parentEl.children[1] as Element | undefined;
  if (!el0 || !el1) return false;

  if (!tagsEqualIgnoreCase(el0.tagName, c0.type)) return false;
  if (!tagsEqualIgnoreCase(el1.tagName, c1.type)) return false;

  const t0 = (c0.children || c0.props?.children) as unknown;
  const t1 = (c1.children || c1.props?.children) as unknown;

  if (typeof t0 === 'string' || typeof t0 === 'number') {
    setTextNodeData(el0, String(t0));
  } else if (
    Array.isArray(t0) &&
    t0.length === 1 &&
    (typeof t0[0] === 'string' || typeof t0[0] === 'number')
  ) {
    setTextNodeData(el0, String(t0[0]));
  } else {
    return false;
  }

  if (typeof t1 === 'string' || typeof t1 === 'number') {
    setTextNodeData(el1, String(t1));
  } else if (
    Array.isArray(t1) &&
    t1.length === 1 &&
    (typeof t1[0] === 'string' || typeof t1[0] === 'number')
  ) {
    setTextNodeData(el1, String(t1[0]));
  } else {
    return false;
  }

  return true;
}

/** Set text node data or textContent */
function setTextNodeData(el: Element, text: string): void {
  if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
    const textNode = el.firstChild as Text;
    // Guard: skip DOM write when content is already correct to avoid
    // unnecessary layout invalidation on unchanged rows.
    if (textNode.data !== text) textNode.data = text;
  } else {
    el.textContent = text;
  }
}

/** Set data-key attribute with counter callback */
function setDataKey(
  el: Element,
  key: string | number,
  onSet: () => void
): void {
  try {
    const next = String(key);
    if (el.getAttribute('data-key') === next) return;
    el.setAttribute('data-key', next);
    onSet();
  } catch {
    // Ignore errors setting data-key
  }
}

function upperCommonTagName(tag: string): string | null {
  // Fast common tags (avoid per-iteration allocations).
  switch (tag) {
    case 'div':
      return 'DIV';
    case 'span':
      return 'SPAN';
    case 'p':
      return 'P';
    case 'a':
      return 'A';
    case 'button':
      return 'BUTTON';
    case 'input':
      return 'INPUT';
    case 'ul':
      return 'UL';
    case 'ol':
      return 'OL';
    case 'li':
      return 'LI';
    default:
      return null;
  }
}

function tagNamesEqualIgnoreCase(a: string, b: string): boolean {
  if (a === b) return true;
  const len = a.length;
  if (len !== b.length) return false;

  for (let i = 0; i < len; i++) {
    const ac = a.charCodeAt(i);
    const bc = b.charCodeAt(i);

    if (ac === bc) continue;

    // ASCII-only case fold; tag names are ASCII.
    const an = ac >= 65 && ac <= 90 ? ac + 32 : ac; // A-Z -> a-z
    const bn = bc >= 65 && bc <= 90 ? bc + 32 : bc;
    if (an !== bn) return false;
  }

  return true;
}

function tagsEqualIgnoreCase(
  elementTagName: string,
  vnodeType: string
): boolean {
  const upperCommon = upperCommonTagName(vnodeType);
  if (upperCommon !== null && elementTagName === upperCommon) return true;
  // Works for HTML and non-HTML elements without allocating.
  return tagNamesEqualIgnoreCase(elementTagName, vnodeType);
}

/** Replace node at position with new vnode */
function replaceNodeAtPosition(
  parent: Element,
  index: number,
  vnode: VNode
): void {
  const dom = createDOMNode(vnode);
  if (dom) {
    const existing = parent.children[index];
    if (existing) {
      teardownNodeSubtree(existing);
      parent.replaceChild(dom, existing);
    } else {
      parent.appendChild(dom);
    }
  }
}

/** Update keyed elements map after bulk operation */
function updateKeyedElementsMap(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
): void {
  try {
    // HOT PATH: reuse the existing map to avoid per-update allocations.
    const existing = keyedElements.get(parent);
    const newKeyMap = existing
      ? (existing.clear(), existing)
      : new Map<string | number, Element>();
    for (let i = 0; i < keyedVnodes.length; i++) {
      const k = keyedVnodes[i].key;
      const ch = parent.children[i] as Element | undefined;
      if (ch) newKeyMap.set(k, ch);
    }
    keyedElements.set(parent, newKeyMap);
  } catch {
    // Ignore errors updating key map
  }
}

export function performBulkTextReplace(parent: Element, newChildren: VNode[]) {
  const t0 = now();
  const existing = Array.from(parent.childNodes);
  const finalNodes: Node[] = [];
  let reused = 0;
  let created = 0;

  for (let i = 0; i < newChildren.length; i++) {
    const result = processChildNode(newChildren[i], existing[i], finalNodes);
    if (result === 'reused') reused++;
    else if (result === 'created') created++;
  }

  const tBuild = now() - t0;
  const tCommit = commitBulkReplace(parent, finalNodes);

  // Clear keyed map for unkeyed path
  keyedElements.delete(parent);

  const stats = {
    n: newChildren.length,
    reused,
    created,
    tBuild,
    tCommit,
  } as const;
  recordBulkTextStats(stats);

  return stats;
}

/** Process a single child vnode for bulk replace */
function processChildNode(
  vnode: VNode,
  existingNode: ChildNode | undefined,
  finalNodes: Node[]
): 'reused' | 'created' | 'skipped' {
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return processTextVnode(String(vnode), existingNode, finalNodes);
  }

  if (typeof vnode === 'object' && vnode !== null && 'type' in vnode) {
    return processElementVnode(vnode, existingNode, finalNodes);
  }

  return 'skipped';
}

/** Process text vnode */
function processTextVnode(
  text: string,
  existingNode: ChildNode | undefined,
  finalNodes: Node[]
): 'reused' | 'created' {
  if (existingNode && existingNode.nodeType === 3) {
    (existingNode as Text).data = text;
    finalNodes.push(existingNode);
    return 'reused';
  }
  finalNodes.push(document.createTextNode(text));
  return 'created';
}

/** Process element vnode */
function processElementVnode(
  vnode: VNode,
  existingNode: ChildNode | undefined,
  finalNodes: Node[]
): 'reused' | 'created' | 'skipped' {
  const vnodeObj = vnode as unknown as { type?: unknown };

  if (typeof vnodeObj.type === 'string') {
    const tag = vnodeObj.type;
    if (
      existingNode &&
      existingNode.nodeType === 1 &&
      tagsEqualIgnoreCase((existingNode as Element).tagName, tag)
    ) {
      updateElementFromVnode(existingNode as Element, vnode);
      finalNodes.push(existingNode);
      return 'reused';
    }
  }

  const dom = createDOMNode(vnode);
  if (dom) {
    finalNodes.push(dom);
    return 'created';
  }
  return 'skipped';
}

/** Clean up nodes that will be removed */
/** Commit bulk replace with fragment */
function commitBulkReplace(parent: Element, nodes: Node[]): number {
  const fragStart = Date.now();
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < nodes.length; i++) {
    fragment.appendChild(nodes[i]);
  }

  // Cleanup nodes that will be removed.
  // At this point, any reused nodes have been moved into the fragment, so
  // whatever remains under `parent` will be removed by replaceChildren.
  try {
    for (let n = parent.firstChild; n; ) {
      const next = n.nextSibling;
      teardownNodeSubtree(n);
      n = next;
    }
  } catch {
    // SLOW PATH: cleanup failure
  }

  recordDOMReplace('bulk-text-replace');
  parent.replaceChildren(fragment);
  return Date.now() - fragStart;
}

/** Record bulk text fast-path stats */
function recordBulkTextStats(stats: {
  n: number;
  reused: number;
  created: number;
  tBuild: number;
  tCommit: number;
}): void {
  try {
    setDevValue('__LAST_BULK_TEXT_FASTPATH_STATS', stats);
    setDevValue('__LAST_FASTPATH_STATS', stats);
    setDevValue('__LAST_FASTPATH_COMMIT_COUNT', 1);
    incDevCounter('bulkTextFastpathHits');
  } catch {
    // Ignore stats errors
  }
}

/**
 * Heuristic to detect large bulk text-dominant updates eligible for fast-path.
 * Conditions:
 *  - total children >= threshold
 *  - majority of children are simple text (string/number) or intrinsic elements
 *    with a single primitive child
 *  - conservative: avoid when component children or complex shapes present
 */
export function isBulkTextFastPathEligible(
  parent: Element,
  newChildren: VNode[]
) {
  const env = getRuntimeEnv();
  const threshold = Number(env.ASKR_BULK_TEXT_THRESHOLD) || 1024;
  const requiredFraction = 0.8;

  const total = Array.isArray(newChildren) ? newChildren.length : 0;

  if (total < threshold) {
    recordBulkDiag({
      phase: 'bulk-unkeyed-eligible',
      reason: 'too-small',
      total,
      threshold,
    });
    return false;
  }

  const result = countSimpleChildren(newChildren);
  if (result.componentFound !== undefined) {
    recordBulkDiag({
      phase: 'bulk-unkeyed-eligible',
      reason: 'component-child',
      index: result.componentFound,
    });
    return false;
  }

  const fraction = result.simple / total;
  const eligible =
    fraction >= requiredFraction && parent.childNodes.length >= total;

  recordBulkDiag({
    phase: 'bulk-unkeyed-eligible',
    total,
    simple: result.simple,
    fraction,
    requiredFraction,
    eligible,
  });

  return eligible;
}

/** Count simple children (text/number or simple intrinsic elements) */
function countSimpleChildren(children: VNode[]): {
  simple: number;
  componentFound?: number;
} {
  let simple = 0;

  for (let i = 0; i < children.length; i++) {
    const c = children[i];

    if (typeof c === 'string' || typeof c === 'number') {
      simple++;
      continue;
    }

    if (typeof c === 'object' && c !== null && 'type' in c) {
      const dv = c as DOMElement;

      // Component child - decline fast path
      if (typeof dv.type === 'function') {
        return { simple, componentFound: i };
      }

      if (typeof dv.type === 'string' && isSimpleElement(dv)) {
        simple++;
      }
    }
  }

  return { simple };
}

/** Check if element is simple (empty or single text child) */
function isSimpleElement(dv: DOMElement): boolean {
  const children = dv.children || dv.props?.children;

  // CRITICAL: Check for null/undefined explicitly, not falsy values
  // because 0, false, and '' are valid children that should return true (simple)
  if (children === null || children === undefined) return true; // empty element

  if (typeof children === 'string' || typeof children === 'number') {
    return true;
  }

  if (
    Array.isArray(children) &&
    children.length === 1 &&
    (typeof children[0] === 'string' || typeof children[0] === 'number')
  ) {
    return true;
  }

  return false;
}

/** Record bulk diagnostics */
function recordBulkDiag(data: Record<string, unknown>): void {
  const env = getRuntimeEnv();
  if (env.NODE_ENV !== 'production' || env.ASKR_FASTPATH_DEBUG === '1') {
    try {
      setDevValue('__BULK_DIAG', data);
    } catch {
      // Ignore
    }
  }
}
