import { logger } from '../dev/logger';
import { STATIC_CHILDREN } from '../common/jsx';
import { getRuntimeEnv } from './env';
import type { Props } from '../common/props';
import { Fragment } from '../jsx/jsx-runtime';
import {
  CONTEXT_FRAME_SYMBOL,
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
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
  createChildScope,
  disposeChildScope,
  rerenderChildScope,
  type ChildScope,
} from '../runtime/child-scope';
import {
  elementListeners,
  removeAllListeners,
  teardownNodeSubtree,
  elementReactivePropsCleanup,
  REACTIVE_CHILDREN_KEY,
  removeElementListeners,
  removeElementReactiveProps,
  type ReactivePropCleanupEntry,
} from './cleanup';
import { incDevCounter, getDevValue } from '../runtime/dev-namespace';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { __FOR_BOUNDARY__, __ERROR_BOUNDARY__ } from '../common/vnode';
import {
  evaluateForState,
  clearForDomUpdateState,
  isBenchMetricScopeActive,
  recordBenchCounter,
  recordBenchEvent,
} from '../runtime/for';
import {
  clearCaseDomUpdateState,
  clearShowDomUpdateState,
  evaluateCaseState,
  evaluateShowState,
  type ControlBoundaryState,
} from '../runtime/control';
import { keyedElements } from './keyed';
import { commitForStateBoundaryChildren } from './for-commit';
import {
  parseEventName,
  getPassiveOptions,
  createMutableWrappedHandler,
  isSkippedProp,
  readElementClassName,
  writeElementClassName,
  tagNamesEqualIgnoreCase,
  extractKey,
} from './utils';
import { reconcileKeyedChildren } from './reconcile';
import {
  isBulkTextFastPathEligible,
  performBulkPositionalKeyedTextUpdate,
  performBulkTextReplace,
} from './children';
import type { ReadableSource } from '../runtime/readable';
import { incrementPerfMetric } from '../runtime/perf-metrics';
import { globalScheduler } from '../runtime/scheduler';
import {
  createFineGrainedEffect,
  markFineGrainedEffectsDirtySource,
  type FineGrainedEffectHandle,
} from '../runtime/effect';
import {
  createBoundaryReset,
  reportBoundaryError,
  resolveErrorBoundaryFallback,
} from '../components/error-boundary';
import {
  isEventDelegationEnabled,
  addDelegatedListener,
  getDelegatedHandlerForElement,
  getDelegatedHandlersForElement,
  updateDelegatedListener,
  removeDelegatedListener,
  isDelegatedEvent,
} from '../runtime/events';

export {
  isBulkTextFastPathEligible,
  performBulkPositionalKeyedTextUpdate,
  performBulkTextReplace,
};

type ElementWithContext = DOMElement & {
  [CONTEXT_FRAME_SYMBOL]?: ContextFrame;
  __instance?: ComponentInstance;
};

type InstanceHostElement = Element & {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
  __ASKR_WRAPPER_HOST?: boolean;
};

interface ReactivePropDescriptor {
  el: Element;
  propName: string;
  propFn: () => unknown;
  tagName: string;
  lastClassTokens: string[] | null;
}

type StyleEntries = Map<string, string>;

type ReactiveScalarChildSourceSlot =
  | { kind: 'static'; value: string }
  | { kind: 'dynamic'; compute: () => unknown };

type ReactiveScalarChildSource = ReactiveScalarChildSourceSlot[];

type ReactiveChildBoundarySequenceSource = Array<
  | { kind: 'static-text'; value: string }
  | { kind: 'static-node'; value: VNode }
  | { kind: 'dynamic'; compute: () => VNode }
>;

type ReactiveChildBoundarySequenceEntry =
  | { kind: 'static'; nodes: Node[] }
  | { kind: 'dynamic'; scope: ChildScope; nodes: Node[] };

const reactivePropRegistry = new Set<ReactivePropDescriptor>();
const controlBoundaryOwners = new WeakMap<Element, ControlBoundaryState>();

type ControlBoundaryCommitOwnerState = ControlBoundaryState & {
  _commitOwner?: Element | null;
};
let reactiveChildScopeId = 0;

function collectReactiveScalarSequenceValue(
  value: unknown,
  normalized: string[]
): boolean {
  if (isFragmentVNode(value)) {
    const fragmentChildren = value.props?.children ?? value.children;
    return collectReactiveScalarSequenceValue(fragmentChildren, normalized);
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      if (!collectReactiveScalarSequenceValue(child, normalized)) {
        return false;
      }
    }
    return true;
  }

  if (value === null || value === undefined || value === false) {
    return true;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    normalized.push(String(value));
    return true;
  }

  return false;
}

function collectReactiveScalarChildSource(
  children: unknown,
  slots: ReactiveScalarChildSource,
  state: { hasDynamic: boolean }
): boolean {
  if (isFragmentVNode(children)) {
    const fragmentChildren = children.props?.children ?? children.children;
    return collectReactiveScalarChildSource(fragmentChildren, slots, state);
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      if (!collectReactiveScalarChildSource(child, slots, state)) {
        return false;
      }
    }
    return true;
  }

  if (children === null || children === undefined || children === false) {
    return true;
  }

  if (typeof children === 'function') {
    slots.push({ kind: 'dynamic', compute: children as () => unknown });
    state.hasDynamic = true;
    return true;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    slots.push({ kind: 'static', value: String(children) });
    return true;
  }

  return false;
}

function getReactiveScalarChildSource(
  children: unknown
): ReactiveScalarChildSource | null {
  const slots: ReactiveScalarChildSource = [];
  const state = { hasDynamic: false };

  if (!collectReactiveScalarChildSource(children, slots, state)) {
    return null;
  }

  return state.hasDynamic ? slots : null;
}

function getSingleReactiveChildBoundarySource(
  children: unknown
): (() => VNode) | null {
  if (isFragmentVNode(children)) {
    const fragmentChildren = children.props?.children ?? children.children;
    return getSingleReactiveChildBoundarySource(fragmentChildren);
  }

  if (Array.isArray(children)) {
    if (children.length !== 1) {
      return null;
    }
    return getSingleReactiveChildBoundarySource(children[0]);
  }

  if (typeof children === 'function') {
    return children as () => VNode;
  }

  return null;
}

function collectReactiveChildBoundarySequenceSource(
  children: unknown,
  slots: ReactiveChildBoundarySequenceSource,
  state: { dynamicCount: number }
): boolean {
  if (isFragmentVNode(children)) {
    const fragmentChildren = children.props?.children ?? children.children;
    return collectReactiveChildBoundarySequenceSource(
      fragmentChildren,
      slots,
      state
    );
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      if (!collectReactiveChildBoundarySequenceSource(child, slots, state)) {
        return false;
      }
    }
    return true;
  }

  if (children === null || children === undefined || children === false) {
    return true;
  }

  if (typeof children === 'function') {
    slots.push({ kind: 'dynamic', compute: children as () => VNode });
    state.dynamicCount += 1;
    return true;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    slots.push({ kind: 'static-text', value: String(children) });
    return true;
  }

  if (_isDOMElement(children)) {
    slots.push({ kind: 'static-node', value: children as VNode });
    return true;
  }

  return false;
}

function getReactiveChildBoundarySequenceSource(
  children: unknown
): ReactiveChildBoundarySequenceSource | null {
  const slots: ReactiveChildBoundarySequenceSource = [];
  const state = { dynamicCount: 0 };

  if (!collectReactiveChildBoundarySequenceSource(children, slots, state)) {
    return null;
  }

  return state.dynamicCount >= 1 && slots.length > 1 ? slots : null;
}

function areReactiveChildBoundarySequenceSourcesEqual(
  previousSource: unknown,
  nextSource: ReactiveChildBoundarySequenceSource
): boolean {
  if (
    !Array.isArray(previousSource) ||
    previousSource.length !== nextSource.length
  ) {
    return false;
  }

  for (let index = 0; index < nextSource.length; index += 1) {
    const previousSlot = previousSource[index] as
      | ReactiveChildBoundarySequenceSource[number]
      | undefined;
    const nextSlot = nextSource[index];

    if (!previousSlot || previousSlot.kind !== nextSlot.kind) {
      return false;
    }

    if (nextSlot.kind === 'static-text') {
      if (
        previousSlot.kind !== 'static-text' ||
        previousSlot.value !== nextSlot.value
      ) {
        return false;
      }
      continue;
    }

    if (nextSlot.kind === 'static-node') {
      if (
        previousSlot.kind !== 'static-node' ||
        previousSlot.value !== nextSlot.value
      ) {
        return false;
      }
      continue;
    }

    if (
      previousSlot.kind !== 'dynamic' ||
      previousSlot.compute !== nextSlot.compute
    ) {
      return false;
    }
  }

  return true;
}

function cleanupDetachedComponentHost(
  host: InstanceHostElement,
  retainedInstance: ComponentInstance
): void {
  removeElementListeners(host);
  removeElementReactiveProps(host);

  const hostInstances = host.__ASKR_INSTANCES;
  if (hostInstances && hostInstances.length > 0) {
    for (const instance of hostInstances) {
      if (instance === retainedInstance) continue;
      cleanupComponent(instance);
    }
  } else if (
    host.__ASKR_INSTANCE &&
    host.__ASKR_INSTANCE !== retainedInstance
  ) {
    cleanupComponent(host.__ASKR_INSTANCE);
  }

  const descendants = host.querySelectorAll('*');
  for (let index = 0; index < descendants.length; index += 1) {
    const descendant = descendants[index] as InstanceHostElement;
    removeElementListeners(descendant);
    removeElementReactiveProps(descendant);

    if (descendant.__ASKR_INSTANCES?.length) {
      for (const instance of descendant.__ASKR_INSTANCES) {
        if (instance === retainedInstance) continue;
        cleanupComponent(instance);
      }
      try {
        delete descendant.__ASKR_INSTANCES;
      } catch {
        // Ignore host cleanup failures.
      }
    } else if (
      descendant.__ASKR_INSTANCE &&
      descendant.__ASKR_INSTANCE !== retainedInstance
    ) {
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

function canUpdateReactiveChildBoundarySequenceSource(
  previousSource: unknown,
  nextSource: ReactiveChildBoundarySequenceSource
): boolean {
  if (
    !Array.isArray(previousSource) ||
    previousSource.length !== nextSource.length
  ) {
    return false;
  }

  for (let index = 0; index < nextSource.length; index += 1) {
    const previousSlot = previousSource[index] as
      | ReactiveChildBoundarySequenceSource[number]
      | undefined;
    const nextSlot = nextSource[index];

    if (!previousSlot || previousSlot.kind !== nextSlot.kind) {
      return false;
    }

    if (nextSlot.kind === 'static-text') {
      if (
        previousSlot.kind !== 'static-text' ||
        previousSlot.value !== nextSlot.value
      ) {
        return false;
      }
      continue;
    }

    if (nextSlot.kind === 'static-node') {
      if (
        previousSlot.kind !== 'static-node' ||
        previousSlot.value !== nextSlot.value
      ) {
        return false;
      }
    }
  }

  return true;
}

function areReactiveScalarChildSourcesEqual(
  previousSource: unknown,
  nextSource: ReactiveScalarChildSource
): boolean {
  if (
    !Array.isArray(previousSource) ||
    previousSource.length !== nextSource.length
  ) {
    return false;
  }

  for (let index = 0; index < nextSource.length; index += 1) {
    const previousSlot = previousSource[index] as
      | ReactiveScalarChildSourceSlot
      | undefined;
    const nextSlot = nextSource[index];

    if (!previousSlot || previousSlot.kind !== nextSlot.kind) {
      return false;
    }

    if (nextSlot.kind === 'static') {
      if (
        previousSlot.kind !== 'static' ||
        previousSlot.value !== nextSlot.value
      ) {
        return false;
      }
      continue;
    }

    if (
      previousSlot.kind !== 'dynamic' ||
      previousSlot.compute !== nextSlot.compute
    ) {
      return false;
    }
  }

  return true;
}

function getOrCreateElementReactiveCleanupMap(
  el: Element
): Map<string, ReactivePropCleanupEntry> {
  let cleanupMap = elementReactivePropsCleanup.get(el);
  if (!cleanupMap) {
    cleanupMap = new Map();
    elementReactivePropsCleanup.set(el, cleanupMap);
  }

  return cleanupMap;
}

function normalizeReactiveScalarSequenceValues(
  values: unknown[]
): string[] | null {
  const normalized: string[] = [];

  for (const value of values) {
    if (!collectReactiveScalarSequenceValue(value, normalized)) {
      return null;
    }
  }

  return normalized;
}

function normalizeOwnedReactiveTextValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return null;
}

function collectReactiveChildValuesAsVNodes(
  values: unknown[],
  children: VNode[]
): void {
  for (const value of values) {
    collectReactiveChildBoundaryVNodes(value, children);
  }
}

function materializeReactiveChildBoundaryNodes(
  value: unknown,
  parentNamespace?: string
): Node[] {
  const nodes: Node[] = [];
  const dom = createDOMNode(value, parentNamespace);
  if (!dom) {
    return nodes;
  }

  if (dom instanceof DocumentFragment) {
    for (let child = dom.firstChild; child; child = dom.firstChild) {
      nodes.push(child);
      dom.removeChild(child);
    }
    return nodes;
  }

  nodes.push(dom);
  return nodes;
}

function syncReactiveScalarTextNodes(
  el: Element,
  slotValues: unknown[],
  values: string[]
): void {
  const childNodes = el.childNodes;
  const canPatchInPlace = childNodes.length === values.length;

  if (canPatchInPlace) {
    let allText = true;
    for (let index = 0; index < childNodes.length; index += 1) {
      if (childNodes[index]?.nodeType !== Node.TEXT_NODE) {
        allText = false;
        break;
      }
    }

    if (allText) {
      for (let index = 0; index < values.length; index += 1) {
        const textNode = childNodes[index] as Text;
        if (textNode.data !== values[index]) {
          textNode.data = values[index];
        }
      }
      return;
    }
  }

  const host = createReactiveChildBoundaryHost(el);
  for (let node = el.firstChild; node; ) {
    const next = node.nextSibling;
    host.appendChild(node);
    node = next;
  }

  updateElementChildren(host, slotValues as VNode[]);
  syncReactiveChildExpectedNodes(el, Array.from(host.childNodes));
}

function trySyncScalarChildSequenceInPlace(
  el: Element,
  children: unknown[]
): boolean {
  const normalized = normalizeReactiveScalarSequenceValues(children);
  if (!normalized) {
    return false;
  }

  if (el.childNodes.length !== normalized.length) {
    return false;
  }

  for (let index = 0; index < el.childNodes.length; index += 1) {
    if (el.childNodes[index]?.nodeType !== Node.TEXT_NODE) {
      return false;
    }
  }

  syncReactiveScalarTextNodes(el, children, normalized);
  return true;
}

function normalizeReactiveChildBoundaryVNode(value: VNode): VNode {
  if (!isFragmentVNode(value)) {
    return value;
  }

  const children = normalizeComponentChildren(value);
  if (children.length !== 1) {
    return value;
  }

  return normalizeReactiveChildBoundaryVNode(children[0] as VNode);
}

function isSingleRootReactiveChildBoundaryValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) {
    return true;
  }

  if (Array.isArray(value)) {
    return (
      value.length === 1 && isSingleRootReactiveChildBoundaryValue(value[0])
    );
  }

  if (isFragmentVNode(value)) {
    const children = normalizeComponentChildren(value);
    return (
      children.length === 1 &&
      isSingleRootReactiveChildBoundaryValue(children[0])
    );
  }

  return true;
}

function collectReactiveChildBoundaryVNodes(
  value: unknown,
  children: VNode[]
): void {
  if (value === null || value === undefined || value === false) {
    return;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      collectReactiveChildBoundaryVNodes(child, children);
    }
    return;
  }

  if (isFragmentVNode(value)) {
    const fragmentChildren = value.props?.children ?? value.children;
    collectReactiveChildBoundaryVNodes(fragmentChildren, children);
    return;
  }

  children.push(value as VNode);
}

function createReactiveChildBoundaryHost(el: Element): Element {
  const ownerDocument = el.ownerDocument;
  return el.namespaceURI === SVG_NAMESPACE
    ? ownerDocument.createElementNS(SVG_NAMESPACE, 'g')
    : ownerDocument.createElement('div');
}

function disposeReactiveChildBoundaryNodes(nodes: Node[]): void {
  for (const node of nodes) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }

    if (node instanceof Element) {
      teardownNodeSubtree(node);
    }
  }
}

function syncReactiveChildExpectedNodes(
  el: Element,
  expectedNodes: Node[]
): void {
  const expectedNodeSet = new Set(expectedNodes);

  for (let node = el.firstChild; node; ) {
    const next = node.nextSibling;
    if (!expectedNodeSet.has(node)) {
      if (node instanceof Element) {
        teardownNodeSubtree(node);
      }
      el.removeChild(node);
    }
    node = next;
  }

  let anchor = el.firstChild;
  for (const node of expectedNodes) {
    if (node === anchor) {
      anchor = anchor.nextSibling;
      continue;
    }

    el.insertBefore(node, anchor);
    anchor = node.nextSibling;
  }
}

function commitReactiveChildBoundaryEntryNodes(
  el: Element,
  entry: { scope: ChildScope; nodes: Node[] }
): Node[] {
  if (!entry.scope.needsDomUpdate) {
    return entry.nodes;
  }

  if (
    entry.scope.vnode === null ||
    entry.scope.vnode === undefined ||
    entry.scope.vnode === false
  ) {
    if (entry.nodes.length > 0) {
      disposeReactiveChildBoundaryNodes(entry.nodes);
      entry.nodes = [];
    }

    const dom = entry.scope.dom;
    if (dom?.parentNode === el) {
      if (dom instanceof Element) {
        teardownNodeSubtree(dom);
      }
      el.removeChild(dom);
    }

    entry.scope.dom = undefined;
    entry.scope.needsDomUpdate = false;
    return entry.nodes;
  }

  if (!isSingleRootReactiveChildBoundaryValue(entry.scope.vnode)) {
    const nextChildren: VNode[] = [];
    collectReactiveChildBoundaryVNodes(entry.scope.vnode, nextChildren);

    const host = createReactiveChildBoundaryHost(el);
    for (const node of entry.nodes) {
      host.appendChild(node);
    }

    updateElementChildren(host, nextChildren);

    const nextNodes = Array.from(host.childNodes);

    entry.scope.dom = undefined;
    entry.scope.needsDomUpdate = false;
    entry.nodes = nextNodes;
    return nextNodes;
  }

  if (entry.nodes.length > 1) {
    disposeReactiveChildBoundaryNodes(entry.nodes);
    entry.nodes = [];
    entry.scope.dom = undefined;
  }

  const nextDom = syncForItemDom(el, entry.scope, entry.scope.vnode ?? null);
  if (!nextDom) {
    entry.nodes = [];
    entry.scope.needsDomUpdate = false;
    return entry.nodes;
  }

  entry.nodes = [nextDom];
  entry.scope.needsDomUpdate = false;
  return entry.nodes;
}

function syncReactiveChildSequenceNodes(
  el: Element,
  entries: ReactiveChildBoundarySequenceEntry[]
): void {
  const expectedNodes: Node[] = [];

  for (const entry of entries) {
    if (entry.kind === 'static') {
      expectedNodes.push(...entry.nodes);
      continue;
    }

    expectedNodes.push(...commitReactiveChildBoundaryEntryNodes(el, entry));
  }

  syncReactiveChildExpectedNodes(el, expectedNodes);
}

function setupReactiveScalarChild(
  el: Element,
  source: ReactiveScalarChildSource
): {
  cleanup: () => void;
  updateFn: (nextSource: ReactiveScalarChildSource) => void;
} {
  let currentSource = source;

  if (source.length === 1 && source[0]?.kind === 'dynamic') {
    let ownedTextNode =
      el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE
        ? (el.firstChild as Text)
        : null;

    let effectHandle: FineGrainedEffectHandle<string> | null =
      createFineGrainedEffect({
        lane: 'reactive',
        compute: () => {
          const currentSlot = currentSource[0];
          if (!currentSlot || currentSlot.kind !== 'dynamic') {
            throw new Error(
              '[Askr] Direct reactive text bindings require a single dynamic slot.'
            );
          }

          const rawValue = currentSlot.compute();
          const normalized = normalizeOwnedReactiveTextValue(rawValue);
          return normalized ?? (rawValue as string);
        },
        commit: (value) => {
          const normalized = normalizeOwnedReactiveTextValue(value);

          if (normalized === null) {
            ownedTextNode = null;
            updateElementChildren(
              el,
              value as unknown as VNode | VNode[] | undefined
            );
            return;
          }

          if (
            !ownedTextNode ||
            el.childNodes.length !== 1 ||
            el.firstChild !== ownedTextNode
          ) {
            updateElementChildren(el, normalized);
            ownedTextNode =
              el.childNodes.length === 1 &&
              el.firstChild?.nodeType === Node.TEXT_NODE
                ? (el.firstChild as Text)
                : null;
          }

          if (!ownedTextNode) {
            return;
          }

          if (ownedTextNode.data !== normalized) {
            ownedTextNode.data = normalized;
            incDevCounter('textNodeWrites');
          }
        },
        onError: (err) => {
          if (getRuntimeEnv().NODE_ENV !== 'production') {
            logger.warn('[Askr] Reactive child update failed:', err);
          }
        },
      });

    return {
      cleanup: () => {
        effectHandle?.cleanup();
        effectHandle = null;
      },
      updateFn: (nextSource: ReactiveScalarChildSource) => {
        if (!effectHandle) {
          return;
        }

        currentSource = nextSource;
        effectHandle.updateCompute(() => {
          const currentSlot = currentSource[0];
          if (!currentSlot || currentSlot.kind !== 'dynamic') {
            throw new Error(
              '[Askr] Direct reactive text bindings require a single dynamic slot.'
            );
          }

          const rawValue = currentSlot.compute();
          const normalized = normalizeOwnedReactiveTextValue(rawValue);
          return normalized ?? (rawValue as string);
        });
      },
    };
  }

  let effectHandle: FineGrainedEffectHandle<unknown> | null =
    createFineGrainedEffect({
      lane: 'reactive',
      compute: () =>
        currentSource.map((slot) =>
          slot.kind === 'static' ? slot.value : slot.compute()
        ),
      commit: (values) => {
        if (!Array.isArray(values)) {
          throw new Error(
            '[Askr] Reactive scalar children must evaluate to a slot array.'
          );
        }

        const normalized = normalizeReactiveScalarSequenceValues(values);
        if (normalized) {
          syncReactiveScalarTextNodes(el, values, normalized);
          return;
        }

        const nextChildren: VNode[] = [];
        collectReactiveChildValuesAsVNodes(values, nextChildren);

        const host = createReactiveChildBoundaryHost(el);
        for (let node = el.firstChild; node; ) {
          const next = node.nextSibling;
          host.appendChild(node);
          node = next;
        }

        updateElementChildren(host, nextChildren);
        syncReactiveChildExpectedNodes(el, Array.from(host.childNodes));
      },
      equals: (previousValue, nextValue) => {
        if (!Array.isArray(previousValue) || !Array.isArray(nextValue)) {
          return false;
        }

        const previousNormalized =
          normalizeReactiveScalarSequenceValues(previousValue);
        const nextNormalized = normalizeReactiveScalarSequenceValues(nextValue);

        if (!previousNormalized || !nextNormalized) {
          return false;
        }

        if (previousNormalized.length !== nextNormalized.length) {
          return false;
        }

        for (let index = 0; index < previousNormalized.length; index += 1) {
          if (previousNormalized[index] !== nextNormalized[index]) {
            return false;
          }
        }

        return true;
      },
      onError: (err) => {
        if (getRuntimeEnv().NODE_ENV !== 'production') {
          logger.warn('[Askr] Reactive child update failed:', err);
        }
      },
    });

  return {
    cleanup: () => {
      effectHandle?.cleanup();
      effectHandle = null;
    },
    updateFn: (nextSource: ReactiveScalarChildSource) => {
      if (!effectHandle) {
        return;
      }

      currentSource = nextSource;
      effectHandle.updateCompute(() =>
        currentSource.map((slot) =>
          slot.kind === 'static' ? slot.value : slot.compute()
        )
      );
    },
  };
}

function setupReactiveChildBoundary(
  el: Element,
  childFn: () => VNode
): { cleanup: () => void; updateFn: (nextValue: unknown) => void } {
  let currentChildFn = childFn;
  const parentInstance = getCurrentInstance();
  const entry: { scope: ChildScope; nodes: Node[] } = {
    scope: createChildScope(
      parentInstance,
      `__reactive-child__:${(reactiveChildScopeId += 1)}`,
      () => {
        const expectedNodes = commitReactiveChildBoundaryEntryNodes(el, entry);
        syncReactiveChildExpectedNodes(el, expectedNodes);
      }
    ),
    nodes: [],
  };

  entry.scope.render(() =>
    normalizeReactiveChildBoundaryVNode(currentChildFn())
  );
  syncReactiveChildExpectedNodes(
    el,
    commitReactiveChildBoundaryEntryNodes(el, entry)
  );

  return {
    cleanup: () => {
      const dom = entry.scope.dom;
      const nodes = entry.nodes;
      disposeChildScope(entry.scope);
      entry.nodes = [];

      if (nodes.length > 0) {
        disposeReactiveChildBoundaryNodes(nodes);
        return;
      }

      if (dom?.parentNode === el) {
        if (dom instanceof Element) {
          teardownNodeSubtree(dom);
        }
        el.removeChild(dom);
      }
    },
    updateFn: (nextValue: unknown) => {
      currentChildFn = nextValue as () => VNode;
      rerenderChildScope(entry.scope);
      const expectedNodes = commitReactiveChildBoundaryEntryNodes(el, entry);
      syncReactiveChildExpectedNodes(el, expectedNodes);
    },
  };
}

function setupReactiveChildBoundarySequence(
  el: Element,
  source: ReactiveChildBoundarySequenceSource
): { cleanup: () => void; updateFn: (nextValue: unknown) => void } {
  let currentSource = source;
  const parentInstance = getCurrentInstance();
  const entries: ReactiveChildBoundarySequenceEntry[] = [];
  const dynamicEntries: Array<{
    index: number;
    entry: Extract<ReactiveChildBoundarySequenceEntry, { kind: 'dynamic' }>;
  }> = [];

  if (!currentSource.some((slot) => slot.kind === 'dynamic')) {
    throw new Error(
      '[Askr] Reactive child boundary sequence requires at least one dynamic slot.'
    );
  }

  const syncSequence = () => {
    syncReactiveChildSequenceNodes(el, entries);
  };

  const parentNamespace =
    el.namespaceURI === SVG_NAMESPACE ? SVG_NAMESPACE : undefined;

  for (let index = 0; index < currentSource.length; index += 1) {
    const slot = currentSource[index];
    if (!slot) {
      continue;
    }

    if (slot.kind === 'static-text') {
      entries.push({
        kind: 'static',
        nodes: [document.createTextNode(slot.value)],
      });
      continue;
    }

    if (slot.kind === 'static-node') {
      entries.push({
        kind: 'static',
        nodes: materializeReactiveChildBoundaryNodes(
          slot.value,
          parentNamespace
        ),
      });
      continue;
    }

    const scope = createChildScope(
      parentInstance,
      `__reactive-child-seq__:${(reactiveChildScopeId += 1)}`,
      syncSequence
    );

    const dynamicEntry: Extract<
      ReactiveChildBoundarySequenceEntry,
      { kind: 'dynamic' }
    > = {
      kind: 'dynamic',
      scope,
      nodes: [],
    };
    entries.push(dynamicEntry);
    dynamicEntries.push({ index, entry: dynamicEntry });
  }

  for (const dynamicEntry of dynamicEntries) {
    dynamicEntry.entry.scope.render(() =>
      normalizeReactiveChildBoundaryVNode(
        (
          currentSource[dynamicEntry.index] as {
            kind: 'dynamic';
            compute: () => VNode;
          }
        ).compute()
      )
    );
  }

  syncSequence();

  return {
    cleanup: () => {
      for (const dynamicEntry of dynamicEntries) {
        const dom = dynamicEntry.entry.scope.dom;
        const nodes = dynamicEntry.entry.nodes;
        disposeChildScope(dynamicEntry.entry.scope);

        if (nodes.length > 0) {
          disposeReactiveChildBoundaryNodes(nodes);
          continue;
        }

        if (dom?.parentNode === el) {
          if (dom instanceof Element) {
            teardownNodeSubtree(dom);
          }
          el.removeChild(dom);
        }
      }

      for (const entry of entries) {
        if (entry.kind === 'static') {
          disposeReactiveChildBoundaryNodes(entry.nodes);
        }
      }
    },
    updateFn: (nextValue: unknown) => {
      currentSource = nextValue as ReactiveChildBoundarySequenceSource;
      for (const dynamicEntry of dynamicEntries) {
        rerenderChildScope(dynamicEntry.entry.scope);
      }
      syncSequence();
    },
  };
}

function syncReactiveScalarChild(el: Element, children: unknown): boolean {
  const reactiveChildSource = getReactiveScalarChildSource(children);
  const reactiveChildBoundary = getSingleReactiveChildBoundarySource(children);
  const reactiveChildBoundarySequence =
    getReactiveChildBoundarySequenceSource(children);
  const existingReactiveEntry = elementReactivePropsCleanup
    .get(el)
    ?.get(REACTIVE_CHILDREN_KEY);

  if (
    !reactiveChildSource &&
    !reactiveChildBoundary &&
    !reactiveChildBoundarySequence
  ) {
    if (existingReactiveEntry) {
      existingReactiveEntry.cleanup();
      const cleanupMap = elementReactivePropsCleanup.get(el);
      cleanupMap?.delete(REACTIVE_CHILDREN_KEY);
      if (cleanupMap && cleanupMap.size === 0) {
        elementReactivePropsCleanup.delete(el);
      }
    }

    return false;
  }

  if (reactiveChildSource && !reactiveChildBoundarySequence) {
    if (
      existingReactiveEntry &&
      Array.isArray(existingReactiveEntry.fnRef) &&
      areReactiveScalarChildSourcesEqual(
        existingReactiveEntry.fnRef,
        reactiveChildSource
      )
    ) {
      return true;
    }

    if (
      existingReactiveEntry?.updateFn &&
      Array.isArray(existingReactiveEntry.fnRef)
    ) {
      existingReactiveEntry.updateFn(reactiveChildSource);
      existingReactiveEntry.fnRef = reactiveChildSource;
      return true;
    }

    existingReactiveEntry?.cleanup();

    try {
      const reactive = setupReactiveScalarChild(el, reactiveChildSource);
      getOrCreateElementReactiveCleanupMap(el).set(REACTIVE_CHILDREN_KEY, {
        cleanup: reactive.cleanup,
        updateFn: (nextValue) => {
          reactive.updateFn(nextValue as ReactiveScalarChildSource);
        },
        fnRef: reactiveChildSource,
      });
      return true;
    } catch (error) {
      if (!reactiveChildBoundary && !reactiveChildBoundarySequence) {
        throw error;
      }
    }
  }

  if (reactiveChildBoundarySequence) {
    if (
      existingReactiveEntry &&
      Array.isArray(existingReactiveEntry.fnRef) &&
      areReactiveChildBoundarySequenceSourcesEqual(
        existingReactiveEntry.fnRef,
        reactiveChildBoundarySequence
      )
    ) {
      return true;
    }

    if (
      existingReactiveEntry?.updateFn &&
      Array.isArray(existingReactiveEntry.fnRef) &&
      canUpdateReactiveChildBoundarySequenceSource(
        existingReactiveEntry.fnRef,
        reactiveChildBoundarySequence
      )
    ) {
      existingReactiveEntry.updateFn(reactiveChildBoundarySequence);
      existingReactiveEntry.fnRef = reactiveChildBoundarySequence;
      return true;
    }

    existingReactiveEntry?.cleanup();

    const reactive = setupReactiveChildBoundarySequence(
      el,
      reactiveChildBoundarySequence
    );
    getOrCreateElementReactiveCleanupMap(el).set(REACTIVE_CHILDREN_KEY, {
      cleanup: reactive.cleanup,
      updateFn: reactive.updateFn,
      fnRef: reactiveChildBoundarySequence,
    });
    return true;
  }

  if (existingReactiveEntry?.fnRef === reactiveChildBoundary) {
    return true;
  }

  if (
    existingReactiveEntry?.updateFn &&
    !Array.isArray(existingReactiveEntry.fnRef)
  ) {
    existingReactiveEntry.updateFn(reactiveChildBoundary);
    existingReactiveEntry.fnRef = reactiveChildBoundary;
    return true;
  }

  existingReactiveEntry?.cleanup();

  if (!reactiveChildBoundary) {
    return false;
  }

  const reactive = setupReactiveChildBoundary(el, reactiveChildBoundary);
  getOrCreateElementReactiveCleanupMap(el).set(REACTIVE_CHILDREN_KEY, {
    cleanup: reactive.cleanup,
    updateFn: reactive.updateFn,
    fnRef: reactiveChildBoundary,
  });
  return true;
}

const vnodeComponentInstances = new WeakMap<object, ComponentInstance>();

function getVNodeComponentInstance(
  node: unknown
): ComponentInstance | undefined {
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }

  return (
    vnodeComponentInstances.get(node) ??
    (node as { __instance?: ComponentInstance }).__instance
  );
}

function setVNodeComponentInstance(
  node: unknown,
  instance: ComponentInstance
): void {
  if (typeof node !== 'object' || node === null) {
    return;
  }

  const objectNode = node as { __instance?: ComponentInstance };

  if (Object.prototype.hasOwnProperty.call(objectNode, '__instance')) {
    try {
      objectNode.__instance = instance;
      return;
    } catch {
      // Fall back to WeakMap for readonly vnode metadata.
    }
  }

  if (Object.isExtensible(objectNode)) {
    try {
      objectNode.__instance = instance;
      return;
    } catch {
      // Fall back to WeakMap for frozen/proxied objects.
    }
  }

  vnodeComponentInstances.set(objectNode, instance);
}

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

  if (options !== undefined) {
    el.addEventListener(eventName, trackedHandler, options);
  } else {
    el.addEventListener(eventName, trackedHandler);
  }
  incDevCounter('listenerAdds');

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

export function markReactivePropsDirtySource(
  source: ReadableSource<unknown>
): void {
  markFineGrainedEffectsDirtySource(source);
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
    lastClassTokens: null,
  };

  let effectHandle: FineGrainedEffectHandle<unknown> | null = null;

  reactivePropRegistry.add(descriptor);
  effectHandle = createFineGrainedEffect({
    lane: 'reactive',
    compute: () => descriptor.propFn(),
    commit: (value, previousValue) => {
      incrementPerfMetric('reactivePropReevaluations');
      applyPropValue(el, propName, value, tagName, previousValue, descriptor);
    },
    equals: (previousValue, nextValue) => {
      if (Object.is(previousValue, nextValue)) {
        incrementPerfMetric('skippedDomPropWrites');
        return true;
      }
      return false;
    },
    onError: (err) => {
      if (getRuntimeEnv().NODE_ENV !== 'production') {
        logger.warn('[Askr] Reactive prop update failed:', err);
      }
    },
  });

  if (isBenchMetricScopeActive('coldCreate')) {
    recordBenchCounter('reactivePropsMounted');
  }

  const cleanup = () => {
    reactivePropRegistry.delete(descriptor);
    effectHandle?.cleanup();
    effectHandle = null;
  };

  const updateFn = (nextFn: () => unknown): void => {
    if (!effectHandle) {
      return;
    }

    descriptor.propFn = nextFn;

    try {
      effectHandle.updateCompute(nextFn);
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
    } else if (key === 'value') {
      applyFormControlProp(el, key, '', tagName);
    } else if (key === 'checked') {
      applyFormControlProp(el, key, false, tagName);
    } else if (key === 'style') {
      applyStylePropValue(el, null);
    } else {
      el.removeAttribute(key);
    }
    return;
  }

  if (key === 'class' || key === 'className') {
    applyClassPropValue(el, value, previousValue, descriptor);
  } else if (key === 'style') {
    applyStylePropValue(el, value);
  } else if (key === 'value' || key === 'checked') {
    applyFormControlProp(el, key, value, tagName);
  } else {
    el.setAttribute(key, String(value));
  }
}

function normalizeStylePropertyName(propertyName: string): string {
  if (propertyName.startsWith('--')) {
    return propertyName;
  }

  return propertyName.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function collectCurrentStyleEntries(el: Element): StyleEntries {
  const entries: StyleEntries = new Map();
  const style = (el as HTMLElement | SVGElement).style;

  if (!style) {
    return entries;
  }

  for (let index = 0; index < style.length; index += 1) {
    const propertyName = style.item(index);
    entries.set(propertyName, style.getPropertyValue(propertyName));
  }

  return entries;
}

function normalizeStyleEntries(value: unknown): StyleEntries | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const entries: StyleEntries = new Map();
  for (const [key, entryValue] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (
      entryValue === undefined ||
      entryValue === null ||
      entryValue === false
    ) {
      continue;
    }

    entries.set(normalizeStylePropertyName(key), String(entryValue));
  }

  return entries;
}

function applyStylePropValue(el: Element, value: unknown): void {
  const style = (el as HTMLElement | SVGElement).style;
  if (!style) {
    if (value === null || value === undefined || value === false) {
      el.removeAttribute('style');
      return;
    }

    el.setAttribute('style', String(value));
    return;
  }

  if (value === null || value === undefined || value === false) {
    if (!el.getAttribute('style')) {
      incrementPerfMetric('skippedDomPropWrites');
      return;
    }

    style.cssText = '';
    el.removeAttribute('style');
    return;
  }

  if (typeof value === 'string') {
    if ((el.getAttribute('style') ?? '') === value) {
      incrementPerfMetric('skippedDomPropWrites');
      return;
    }

    style.cssText = value;
    return;
  }

  const nextEntries = normalizeStyleEntries(value);
  if (!nextEntries) {
    const nextText = String(value);
    if ((el.getAttribute('style') ?? '') === nextText) {
      incrementPerfMetric('skippedDomPropWrites');
      return;
    }

    style.cssText = nextText;
    return;
  }

  const previousEntries = collectCurrentStyleEntries(el);
  let didWrite = false;

  for (const [propertyName] of previousEntries) {
    if (nextEntries.has(propertyName)) {
      continue;
    }

    style.removeProperty(propertyName);
    didWrite = true;
  }

  for (const [propertyName, propertyValue] of nextEntries) {
    if (previousEntries.get(propertyName) === propertyValue) {
      continue;
    }

    style.setProperty(propertyName, propertyValue);
    didWrite = true;
  }

  if (!didWrite) {
    incrementPerfMetric('skippedDomPropWrites');
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
        updateFn: (nextValue) => {
          reactive.updateFn(nextValue as () => unknown);
        },
        fnRef: value as () => unknown,
      });
      continue;
    }

    if (key === 'class' || key === 'className') {
      writeElementClassName(el, String(value));
    } else if (key === 'style') {
      applyStylePropValue(el, value);
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

function getRenderedAttributeName(el: Element, propName: string): string {
  let attributeName = propName;
  if (propName === 'className') {
    attributeName = 'class';
  } else if (propName === 'htmlFor') {
    attributeName = 'for';
  }

  return el.namespaceURI === SVG_NAMESPACE
    ? attributeName
    : attributeName.toLowerCase();
}

function removeStaleAttributes(
  el: Element,
  vnode: DOMElement,
  props: Record<string, unknown>
): void {
  const desiredAttributes = new Set<string>();
  const key = extractKey(vnode);

  if (key !== undefined) {
    desiredAttributes.add('data-key');
  }

  for (const propName in props) {
    if (isSkippedProp(propName)) continue;
    if (parseEventName(propName)) continue;

    const value = props[propName];
    if (value === undefined || value === null || value === false) continue;

    desiredAttributes.add(getRenderedAttributeName(el, propName));
  }

  for (const attribute of Array.from(el.attributes)) {
    if (!desiredAttributes.has(getRenderedAttributeName(el, attribute.name))) {
      el.removeAttribute(attribute.name);
    }
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
      const checked = Boolean(value);
      (el as HTMLInputElement & Props).checked = checked;
      if (checked) {
        el.setAttribute('checked', '');
      } else {
        el.removeAttribute('checked');
      }
    } else {
      if (value) {
        el.setAttribute('checked', '');
      } else {
        el.removeAttribute('checked');
      }
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
  const rawKey = vnode.key ?? props?.key;
  const vnodeKey =
    rawKey === null || rawKey === undefined
      ? undefined
      : typeof rawKey === 'symbol'
        ? String(rawKey)
        : (rawKey as string | number);
  if (vnodeKey !== undefined) {
    const nextKey = String(vnodeKey);
    if (el.getAttribute('data-key') !== nextKey) {
      el.setAttribute('data-key', nextKey);
    }
  }
}

function inheritComponentKey(
  target: DOMElement,
  source: DOMElement
): DOMElement {
  const inheritedKey = extractKey(source);
  if (inheritedKey === undefined || extractKey(target) !== undefined) {
    return target;
  }

  target.key = inheritedKey;

  if (typeof target.type === 'string') {
    if (!target.props) {
      target.props = {};
    }

    const props = target.props as Record<string, unknown>;
    if (props['data-key'] === undefined) {
      props['data-key'] = String(inheritedKey);
    }
  }

  return target;
}

// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼
// Dynamic List Warnings
// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼

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

// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼
// DOM Node Creation
// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼

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
      return createForBoundary(node as DOMElement, props, parentNamespace);
    }

    if (type === __ERROR_BOUNDARY__) {
      return createErrorBoundaryElement(
        node as ErrorBoundaryVNode,
        props,
        parentNamespace
      );
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
    } else if (key === 'style') {
      applyStylePropValue(el, value);
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
    const controlBoundaryVNode = getDirectControlBoundaryVNode(children);
    if (controlBoundaryVNode) {
      const controlState = getControlBoundaryState(controlBoundaryVNode);
      if (!controlState) {
        throw new Error(
          '[createIntrinsicElement] Control boundary missing internal state'
        );
      }
      registerControlBoundaryCommitOwner(el, controlState);
    }

    if (syncReactiveScalarChild(el, children)) {
      return el;
    }

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
    try {
      (
        placeholder as Comment & { __ASKR_INSTANCE?: ComponentInstance }
      ).__ASKR_INSTANCE = childInstance;
    } catch {
      // Ignore placeholder metadata failures.
    }
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
  let activeSnapshot = snapshot;
  let depth = 0;

  while (
    _isDOMElement(currentResult) &&
    typeof currentResult.type === 'function' &&
    depth < 16
  ) {
    const nestedSnapshot =
      getVNodeContextFrame(currentResult) ?? activeSnapshot;
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

    activeSnapshot = nestedSnapshot ?? null;
    currentResult = nextResult as VNode;
    depth += 1;
  }

  return currentResult;
}

function resolveWrapperHostResult(
  host: InstanceHostElement,
  result: unknown,
  snapshot: ContextFrame | null
): unknown {
  let currentResult = result;
  let activeSnapshot = snapshot;
  let depth = 0;

  while (
    _isDOMElement(currentResult) &&
    typeof currentResult.type === 'function' &&
    depth < 16
  ) {
    const nestedSnapshot =
      getVNodeContextFrame(currentResult) ?? activeSnapshot;
    const nestedInstance = findHostInstanceByType(
      host,
      currentResult.type as ComponentFunction
    );

    if (!nestedInstance) {
      break;
    }

    nestedInstance.props =
      (((currentResult as DOMElement).props ?? {}) as Props) || {};

    if (nestedSnapshot) {
      nestedInstance.ownerFrame = nestedSnapshot;
    }

    const nextResult = withContext(nestedSnapshot ?? null, () =>
      renderComponentInline(nestedInstance)
    );

    if (nextResult instanceof Promise) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

    warnUnusedStateReads(nestedInstance);
    activeSnapshot = nestedSnapshot ?? null;
    currentResult = nextResult;
    depth += 1;
  }

  return markVNodeTreeWithContextFrame(currentResult, activeSnapshot);
}

function isFragmentVNode(node: unknown): node is DOMElement {
  return (
    _isDOMElement(node) &&
    typeof (node as DOMElement).type === 'symbol' &&
    ((node as DOMElement).type === Fragment ||
      String((node as DOMElement).type) === 'Symbol(askr.fragment)')
  );
}

function normalizeComponentChildren(result: unknown): unknown[] {
  if (result === null || result === undefined || result === false) {
    return [];
  }

  if (Array.isArray(result)) {
    return result;
  }

  if (isFragmentVNode(result)) {
    const children = result.props?.children ?? result.children ?? [];
    return Array.isArray(children) ? children : [children];
  }

  return [result];
}

export function syncComponentElement(
  currentDom: Node | null,
  node: ElementWithContext,
  type: ComponentFunction,
  props: Record<string, unknown>,
  parentNamespace?: string,
  forceChildrenUpdate = false
): Node | null {
  const existingHost =
    currentDom instanceof Element ? (currentDom as InstanceHostElement) : null;
  const existingInstance = existingHost
    ? findHostInstanceByType(existingHost, type)
    : null;
  if (!existingHost) {
    return null;
  }

  if (!existingInstance || existingInstance.fn !== type) {
    const snapshot =
      getVNodeContextFrame(node) || getCurrentContextFrame() || null;
    const hydrationInstance = createComponentInstance(
      nextComponentInstanceId(),
      type,
      props || {},
      existingHost
    );

    setVNodeComponentInstance(node, hydrationInstance);

    if (snapshot) {
      hydrationInstance.ownerFrame = snapshot;
    }

    const result = withContext(snapshot, () =>
      renderComponentInline(hydrationInstance)
    );
    if (result instanceof Promise) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

    const scopedResult = markVNodeTreeWithContextFrame(
      result,
      snapshot ?? null
    );

    if (
      scopedResult &&
      typeof scopedResult === 'object' &&
      'type' in (scopedResult as DOMElement) &&
      typeof (scopedResult as DOMElement).type === 'string' &&
      tagNamesEqualIgnoreCase(
        existingHost.tagName,
        (scopedResult as DOMElement).type as string
      )
    ) {
      withContext(snapshot, () => {
        updateElementFromVnode(
          existingHost,
          inheritComponentKey(scopedResult as DOMElement, node),
          true,
          forceChildrenUpdate || hydrationInstance.mounted === false
        );
        materializeKey(existingHost, node, props);
      });
      mountInstanceInline(hydrationInstance, existingHost);
      itemInstanceHydrationComplete(existingHost);
      warnUnusedStateReads(hydrationInstance);
      return existingHost;
    }

    const resolvedResult = resolveNestedComponentResult(
      scopedResult,
      snapshot ?? null
    );
    if (
      _isDOMElement(resolvedResult) &&
      typeof resolvedResult.type === 'string' &&
      tagNamesEqualIgnoreCase(existingHost.tagName, resolvedResult.type)
    ) {
      withContext(snapshot, () => {
        updateElementFromVnode(
          existingHost,
          inheritComponentKey(resolvedResult, node),
          true,
          forceChildrenUpdate || hydrationInstance.mounted === false
        );
        materializeKey(existingHost, node, props);
      });
      mountInstanceInline(hydrationInstance, existingHost);
      itemInstanceHydrationComplete(existingHost);
      warnUnusedStateReads(hydrationInstance);
      return existingHost;
    }

    const nextDom = materializeComponentResultNode(
      hydrationInstance,
      scopedResult,
      parentNamespace
    );

    if (nextDom instanceof Element) {
      materializeKey(nextDom, node, props);
    }

    if (nextDom !== existingHost && existingHost.parentNode) {
      existingHost.parentNode.replaceChild(nextDom, existingHost);
      cleanupDetachedComponentHost(existingHost, hydrationInstance);
    }

    warnUnusedStateReads(hydrationInstance);
    return nextDom;
  }

  const snapshot =
    getVNodeContextFrame(node) ||
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
  const scopedResult = markVNodeTreeWithContextFrame(result, snapshot ?? null);

  if (existingHost.__ASKR_WRAPPER_HOST) {
    const wrapperResult = resolveWrapperHostResult(
      existingHost,
      scopedResult,
      snapshot ?? null
    );
    updateElementChildren(
      existingHost,
      normalizeComponentChildren(wrapperResult) as VNode[]
    );
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  if (
    scopedResult &&
    typeof scopedResult === 'object' &&
    'type' in (scopedResult as DOMElement) &&
    typeof (scopedResult as DOMElement).type === 'string' &&
    tagNamesEqualIgnoreCase(
      existingHost.tagName,
      (scopedResult as DOMElement).type as string
    )
  ) {
    withContext(snapshot, () => {
      updateElementFromVnode(
        existingHost,
        inheritComponentKey(scopedResult as DOMElement, node),
        true,
        forceChildrenUpdate || existingInstance.mounted === false
      );
      materializeKey(existingHost, node, props);
    });
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  const resolvedResult = resolveNestedComponentResult(
    scopedResult,
    snapshot ?? null
  );
  if (
    _isDOMElement(resolvedResult) &&
    typeof resolvedResult.type === 'string' &&
    tagNamesEqualIgnoreCase(existingHost.tagName, resolvedResult.type)
  ) {
    withContext(snapshot, () => {
      updateElementFromVnode(
        existingHost,
        inheritComponentKey(resolvedResult, node),
        true,
        forceChildrenUpdate || existingInstance.mounted === false
      );
      materializeKey(existingHost, node, props);
    });
    warnUnusedStateReads(existingInstance);
    return existingHost;
  }

  const nextDom = materializeComponentResultNode(
    existingInstance,
    scopedResult,
    parentNamespace
  );

  if (nextDom instanceof Element) {
    materializeKey(nextDom, node, props);
  }

  if (nextDom !== existingHost && existingHost.parentNode) {
    existingHost.parentNode.replaceChild(nextDom, existingHost);
    cleanupDetachedComponentHost(existingHost, existingInstance);
  }

  warnUnusedStateReads(existingInstance);
  return nextDom;
}

function itemInstanceHydrationComplete(host: InstanceHostElement): void {
  const instance = host.__ASKR_INSTANCE;
  if (instance) {
    const scope = (
      instance as unknown as { scope?: { hydrationPending?: boolean } }
    ).scope;
    if (scope) {
      scope.hydrationPending = false;
    }
  }
}

function createComponentElement(
  node: ElementWithContext,
  type: (props: Props) => unknown,
  props: Record<string, unknown>,
  parentNamespace?: string
): Node {
  // Check if this vnode has a marked context frame
  const frame = getVNodeContextFrame(node);
  const snapshot = frame || getCurrentContextFrame();

  const componentFn = type as (props: Props) => unknown;
  const isAsync = componentFn.constructor.name === 'AsyncFunction';

  if (isAsync) {
    throw new Error(
      'Async components are not supported. Use resource() for async work.'
    );
  }

  // Ensure there is a persistent instance object attached to this vnode
  let childInstance = getVNodeComponentInstance(node);
  if (!childInstance) {
    childInstance = createComponentInstance(
      nextComponentInstanceId(),
      componentFn as ComponentFunction,
      props || {},
      null
    );
    setVNodeComponentInstance(node, childInstance);
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

  const scopedResult = markVNodeTreeWithContextFrame(result, snapshot ?? null);

  const dom = withContext(snapshot, () =>
    materializeComponentResultNode(childInstance, scopedResult, parentNamespace)
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
  const children = props.children ?? node.children;
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
 * Do NOT rely on vnode identity (===) ├óΓé¼ΓÇ¥ vnodes are mutable.
 */
function checkVNodeShapeChanged(dom: Node, vnode: VNode): boolean {
  if (!_isDOMElement(vnode)) return true;
  if (!(dom instanceof Element)) return true;
  // Structural check: element type must match
  const vnodeType = (vnode as DOMElement).type;
  if (typeof vnodeType !== 'string') return true;
  return dom.tagName.toLowerCase() !== vnodeType.toLowerCase();
}

function materializeChildScopeDom(
  vnode: VNode,
  parentNamespace?: string
): Node | null {
  if (vnode === null || vnode === undefined || vnode === false) {
    return document.createComment('');
  }

  const dom = createDOMNode(vnode, parentNamespace);
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

function getDirectControlBoundaryVNode(children: unknown): DOMElement | null {
  if (
    !Array.isArray(children) &&
    _isDOMElement(children) &&
    (children as DOMElement).type === __FOR_BOUNDARY__
  ) {
    return children as DOMElement;
  }

  if (
    Array.isArray(children) &&
    children.length === 1 &&
    _isDOMElement(children[0]) &&
    (children[0] as DOMElement).type === __FOR_BOUNDARY__
  ) {
    return children[0] as DOMElement;
  }

  return null;
}

function getControlBoundaryCommitChildren(
  controlState: ControlBoundaryState
): VNode[] {
  if (controlState.kind === 'for' && controlState._needsSourceReconcile) {
    return evaluateForState(controlState);
  }

  if (controlState.kind !== 'for') {
    const activeVNode = controlState.activeScope?.vnode;
    return activeVNode == null || activeVNode === false ? [] : [activeVNode];
  }

  if (controlState.orderedKeys.length === 0) {
    const fallbackVNode = controlState.fallbackScope?.vnode;
    return fallbackVNode == null || fallbackVNode === false
      ? []
      : [fallbackVNode];
  }

  const childrenVNodes: VNode[] = [];
  for (let index = 0; index < controlState.orderedKeys.length; index += 1) {
    const itemKey = controlState.orderedKeys[index];
    const itemInstance = controlState.items.get(itemKey);
    childrenVNodes.push((itemInstance?.scope.vnode ?? null) as VNode);
  }

  return childrenVNodes;
}

function clearControlBoundaryCommitOwner(parent: Element): void {
  const owner = controlBoundaryOwners.get(parent) as
    | ControlBoundaryCommitOwnerState
    | undefined;
  if (owner) {
    owner._enqueueBoundaryCommit = null;
    owner._hasPendingBoundaryCommit = false;
    if (owner._commitOwner === parent) {
      owner._commitOwner = null;
    }
  }

  controlBoundaryOwners.delete(parent);
}

function registerControlBoundaryCommitOwner(
  parent: Element,
  controlState: ControlBoundaryState
): void {
  const ownerState = controlState as ControlBoundaryCommitOwnerState;
  const previousParent = ownerState._commitOwner;
  if (
    previousParent &&
    previousParent !== parent &&
    controlBoundaryOwners.get(previousParent) === controlState
  ) {
    controlBoundaryOwners.delete(previousParent);
  }

  const previousOwner = controlBoundaryOwners.get(parent) as
    | ControlBoundaryCommitOwnerState
    | undefined;
  if (previousOwner && previousOwner !== controlState) {
    previousOwner._enqueueBoundaryCommit = null;
    previousOwner._hasPendingBoundaryCommit = false;
    if (previousOwner._commitOwner === parent) {
      previousOwner._commitOwner = null;
    }
  }

  controlBoundaryOwners.set(parent, controlState);
  ownerState._commitOwner = parent;
  controlState._enqueueBoundaryCommit = () => {
    if (controlState._hasPendingBoundaryCommit) {
      return;
    }

    controlState._hasPendingBoundaryCommit = true;
    globalScheduler.enqueue(() => {
      controlState._hasPendingBoundaryCommit = false;

      if (controlBoundaryOwners.get(parent) !== controlState) {
        return;
      }

      const childrenVNodes = getControlBoundaryCommitChildren(controlState);
      commitForBoundaryChildren(parent, controlState, childrenVNodes);
    });
  };
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
  props: Record<string, unknown>,
  parentNamespace?: string
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
      const dom = materializeChildScopeDom(vnode, parentNamespace);
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
      const dom = materializeChildScopeDom(fallbackVNode, parentNamespace);
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
    // Use orderedKeys[i] to look up items ├óΓé¼ΓÇ¥ this is aligned with vnode order
    // after reconciliation. Do NOT use childVNode.key (JSX key may differ).
    const itemKey = forState.orderedKeys[i];
    const itemInstance = itemKey != null ? forState.items.get(itemKey) : null;

    let dom: Node | null = null;

    // Try to reuse existing DOM if element type matches (structural check).
    // Do NOT rely on vnode identity (===) ├óΓé¼ΓÇ¥ vnodes are mutable.
    if (itemInstance && itemInstance.scope.dom) {
      const cachedDom = itemInstance.scope.dom;
      // Structural check: element type must match for safe reuse
      if (!checkVNodeShapeChanged(cachedDom, childVNode)) {
        dom = cachedDom;
      }
    }

    // Create new DOM if no reusable node available
    if (!dom) {
      dom = materializeChildScopeDom(childVNode, parentNamespace);
      // Cache the DOM in the item instance for future reuse
      if (itemInstance) {
        itemInstance.scope.dom = dom ?? undefined;
      }
    }

    if (dom) {
      // Always update reused DOM from current vnode (never rely on vnode identity)

      // ALWAYS append to fragment ├óΓé¼ΓÇ¥ this is mandatory for correct ordering.
      // Appending an existing node moves it (DOM spec) ├óΓé¼ΓÇ¥ this is how reordering works.
      // No parentElement checks may gate insertion.
      fragment.appendChild(dom);
    }
  }

  clearControlBoundaryDomUpdateState(controlState);
  return fragment;
}

type ErrorBoundaryVNode = DOMElement & {
  __instance?: ComponentInstance;
};

function createErrorBoundaryElement(
  node: ErrorBoundaryVNode,
  props: Record<string, unknown>,
  parentNamespace?: string
): Node {
  const boundaryState = node.__instance?.errorBoundaryState ?? null;
  const reset = node.__instance
    ? createBoundaryReset(node.__instance)
    : () => {};
  const fallback = props.fallback as
    | unknown
    | ((error: unknown, reset: () => void) => unknown);
  const children = props.children;

  if (boundaryState?.error != null) {
    const fallbackValue = resolveErrorBoundaryFallback(
      fallback,
      boundaryState.error,
      reset
    );
    if (fallbackValue instanceof Node) {
      return fallbackValue;
    }
    const fallbackDom = createDOMNode(fallbackValue, parentNamespace);
    return fallbackDom ?? document.createComment('');
  }

  try {
    const dom = createDOMNode(children, parentNamespace);
    return dom ?? document.createComment('');
  } catch (error) {
    if (node.__instance) {
      reportBoundaryError(
        node.__instance,
        error,
        props.onError as ((next: unknown) => void) | undefined
      );
    } else {
      logger.error('[Askr] ErrorBoundary caught render error:', error);
    }

    const fallbackValue = resolveErrorBoundaryFallback(fallback, error, reset);
    if (fallbackValue instanceof Node) {
      return fallbackValue;
    }
    const fallbackDom = createDOMNode(fallbackValue, parentNamespace);
    return fallbackDom ?? document.createComment('');
  }
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

  const parentNamespace =
    parent.namespaceURI === SVG_NAMESPACE ? SVG_NAMESPACE : undefined;

  if (_isDOMElement(vnode) && typeof vnode.type === 'function') {
    const syncedComponentDom = syncComponentElement(
      dom,
      vnode as ElementWithContext,
      vnode.type as ComponentFunction,
      ((vnode as DOMElement).props ?? {}) as Record<string, unknown>,
      parentNamespace
    );
    if (syncedComponentDom) {
      scope.dom = syncedComponentDom ?? undefined;
      return syncedComponentDom;
    }
  }

  if (!dom) {
    dom = materializeChildScopeDom(vnode, parentNamespace);
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

  const nextDom = materializeChildScopeDom(vnode, parentNamespace);
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
    (vnode.props?.children as VNode | VNode[] | undefined) ?? vnode.children
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
    vnode.type as ComponentFunction
  );
  if (
    !existingInstance ||
    existingInstance.fn !== vnode.type ||
    host.__ASKR_WRAPPER_HOST
  ) {
    return null;
  }

  const snapshot =
    getVNodeContextFrame(vnode) ||
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
    return inheritComponentKey(resolvedResult, vnode as DOMElement);
  }

  return null;
}

export function tryPatchStableForDirtyItem(scope: {
  dom?: Node;
  vnode?: VNode;
}): boolean {
  incDevCounter('stableForPatchAttempt');
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

  if (didPatch) {
    incDevCounter('stableForPatchHit');
  }

  return didPatch;
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

  commitForStateBoundaryChildren(parent, controlState, childrenVNodes, {
    isProduction: () => getRuntimeEnv().NODE_ENV === 'production',
    syncForItemDom,
    tryPatchStableForDirtyItem,
  });
}

// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼
// Element Updates
// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼

/**
 * Update an existing element's attributes and children from vnode
 */
export function updateElementFromVnode(
  el: Element,
  vnode: VNode,
  updateChildren = true,
  forceChildrenUpdate = false
): void {
  if (!_isDOMElement(vnode)) {
    return;
  }

  const props = (vnode.props || {}) as Record<string, unknown>;
  const domVNode = vnode as DOMElement;

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
    if (
      !forceChildrenUpdate &&
      hasMatchingStaticProps(el, props, vnode.type as string)
    ) {
      if (updateChildren) {
        const children =
          (props.children as VNode | VNode[] | undefined) ?? vnode.children;
        if (!forceChildrenUpdate && canReuseStaticSubtree(el, domVNode)) {
          return;
        }
        updateElementChildren(el, children, forceChildrenUpdate);
      }
      return;
    }
  }

  // Lazily materialize desired event names only if we need to diff against existing listeners.
  // This avoids allocating a Set for the common case (no listeners, or no event props).
  let desiredEventNames: Set<string> | null = null;
  let desiredReactivePropNames: Set<string> | null = null;
  const nextChildren = props.children ?? domVNode.children;
  const usesReactiveChildren = syncReactiveScalarChild(el, nextChildren);

  if (usesReactiveChildren) {
    (desiredReactivePropNames ??= new Set()).add(REACTIVE_CHILDREN_KEY);
  }

  for (const key in props) {
    const value = props[key];
    if (isSkippedProp(key)) continue;

    const eventName = parseEventName(key);

    // Handle removal cases
    if (value === undefined || value === null || value === false) {
      if (key === 'class' || key === 'className') {
        writeElementClassName(el, '');
      } else if (key === 'value') {
        applyFormControlProp(el, key, '', vnode.type as string);
      } else if (key === 'checked') {
        applyFormControlProp(el, key, false, vnode.type as string);
      } else if (eventName && existingListeners?.has(eventName)) {
        const entry = existingListeners.get(eventName)!;
        incDevCounter('listenerRemoves');
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
        updateFn: (nextValue) => {
          reactive.updateFn(nextValue as () => unknown);
        },
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
    } else if (key === 'style') {
      applyStylePropValue(el, value);
    } else if (key === 'value' || key === 'checked') {
      applyFormControlProp(el, key, value, vnode.type as string);
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
      incDevCounter('listenerAdds');

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

  removeStaleAttributes(el, domVNode, props);

  if (existingListeners && existingListeners.size > 0) {
    // If no event props were present, all existing listeners are undesired.
    if (desiredEventNames === null) {
      existingListeners.forEach((entry, eventName) => {
        incDevCounter('listenerRemoves');
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
          incDevCounter('listenerRemoves');
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
      (props.children as VNode | VNode[] | undefined) ?? vnode.children;
    if (usesReactiveChildren) {
      return;
    }
    updateElementChildren(el, children, forceChildrenUpdate);
  }
}

export function updateElementChildren(
  el: Element,
  children: VNode | VNode[] | undefined,
  forceUpdate = false
): void {
  const directControlBoundary = getDirectControlBoundaryVNode(children);
  if (directControlBoundary) {
    const controlState = getControlBoundaryState(directControlBoundary);
    if (!controlState) {
      throw new Error(
        '[updateElementChildren] Control boundary missing internal state'
      );
    }

    registerControlBoundaryCommitOwner(el, controlState);
    const childrenVNodes = evaluateControlBoundaryState(controlState);
    commitForBoundaryChildren(el, controlState, childrenVNodes as VNode[]);
    return;
  }

  clearControlBoundaryCommitOwner(el);

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

  if (!Array.isArray(children) && isFragmentVNode(children)) {
    updateUnkeyedChildren(
      el,
      normalizeComponentChildren(children),
      forceUpdate
    );
    return;
  }

  if (
    !Array.isArray(children) &&
    (typeof children === 'string' || typeof children === 'number')
  ) {
    if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
      const s = String(children);
      const t = el.firstChild as Text;
      // Skip the write when the text is already correct ├óΓé¼ΓÇ¥ avoids triggering
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

  if (Array.isArray(children)) {
    if (trySyncScalarChildSequenceInPlace(el, children)) {
      keyedElements.delete(el);
      return;
    }

    if (hasKeyedVNodeChildren(children)) {
      const oldKeyMap = getOrBuildDomKeyMap(el);
      const newKeyMap = reconcileKeyedChildren(el, children, oldKeyMap);
      keyedElements.set(el, newKeyMap);
      return;
    }
    if (isBulkTextFastPathEligible(el, children)) {
      performBulkTextReplace(el, children);
      keyedElements.delete(el);
      return;
    }
    updateUnkeyedChildren(el, children as unknown[], forceUpdate);
    return;
  }

  if (_isDOMElement(children)) {
    updateUnkeyedChildren(el, [children], forceUpdate);
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

function hasKeyedVNodeChildren(children: VNode[]): boolean {
  for (let i = 0; i < children.length; i++) {
    if (extractKey(children[i]) !== undefined) return true;
  }
  return false;
}

function isEmptyChild(child: unknown): boolean {
  return child === null || child === undefined || child === false;
}

function getOrBuildDomKeyMap(
  parent: Element
): Map<string | number, Element> | undefined {
  let keyMap = keyedElements.get(parent);
  if (!keyMap) {
    keyMap = new Map<string | number, Element>();
    for (
      let child = parent.firstElementChild;
      child;
      child = child.nextElementSibling
    ) {
      const key = child.getAttribute('data-key');
      if (key !== null) {
        keyMap.set(key, child);
        const numericKey = Number(key);
        if (!Number.isNaN(numericKey)) keyMap.set(numericKey, child);
      }
    }
    if (keyMap.size > 0) keyedElements.set(parent, keyMap);
  }
  return keyMap.size > 0 ? keyMap : undefined;
}

function upperCommonTagName(tag: string): string | null {
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

function tagsEqualIgnoreCase(
  elementTagName: string,
  vnodeType: string
): boolean {
  const upperCommon = upperCommonTagName(vnodeType);
  if (upperCommon !== null && elementTagName === upperCommon) return true;
  return tagNamesEqualIgnoreCase(elementTagName, vnodeType);
}

type StaticChildSlot =
  | { kind: 'text'; value: string }
  | { kind: 'element'; value: DOMElement };

const STATIC_CHILD_SLOTS_CACHE = Symbol.for('__askrStaticChildSlots');
let staticChildSlotsCacheEnabled = true;

interface StaticChildSlotsCacheNode {
  [STATIC_CHILD_SLOTS_CACHE]?: StaticChildSlot[] | null;
}

export function setStaticChildSlotsCacheEnabled(enabled: boolean): void {
  staticChildSlotsCacheEnabled = enabled;
}

function collectStaticChildSlots(
  children: unknown,
  slots: StaticChildSlot[]
): boolean {
  if (isFragmentVNode(children)) {
    const fragmentChildren = children.props?.children ?? children.children;
    return collectStaticChildSlots(fragmentChildren, slots);
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      if (!collectStaticChildSlots(child, slots)) {
        return false;
      }
    }
    return true;
  }

  if (children === null || children === undefined || children === false) {
    return true;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    slots.push({ kind: 'text', value: String(children) });
    return true;
  }

  if (
    _isDOMElement(children) &&
    typeof (children as DOMElement).type === 'string'
  ) {
    slots.push({ kind: 'element', value: children as DOMElement });
    return true;
  }

  return false;
}

function getStaticChildSlots(vnode: DOMElement): StaticChildSlot[] | null {
  if (staticChildSlotsCacheEnabled) {
    const cacheNode = vnode as DOMElement & StaticChildSlotsCacheNode;
    const cached = cacheNode[STATIC_CHILD_SLOTS_CACHE];
    if (cached !== undefined) {
      return cached;
    }
  }

  const slots: StaticChildSlot[] = [];
  const staticSlots = collectStaticChildSlots(
    (vnode.props?.children ?? vnode.children) as unknown,
    slots
  )
    ? slots
    : null;
  if (staticChildSlotsCacheEnabled) {
    const cacheNode = vnode as DOMElement & StaticChildSlotsCacheNode;
    if (Object.isExtensible(vnode)) {
      cacheNode[STATIC_CHILD_SLOTS_CACHE] = staticSlots;
    }
  }
  return staticSlots;
}

function hasMatchingStaticProps(
  el: Element,
  props: Record<string, unknown>,
  vnodeType: string
): boolean {
  let staticPropCount = 0;

  for (const key in props) {
    if (isSkippedProp(key)) continue;

    const value = props[key];
    if (value === undefined || value === null || value === false) {
      return false;
    }

    const eventName = parseEventName(key);
    if (eventName || typeof value === 'function') {
      return false;
    }

    if (key === 'class' || key === 'className') {
      if (readElementClassName(el) !== String(value)) {
        return false;
      }
      staticPropCount += 1;
      continue;
    }

    if (key === 'style') {
      const styleValue =
        typeof value === 'string' ? value.trim().replace(/;$/, '') : null;
      const domStyle = el.getAttribute('style')?.trim().replace(/;$/, '') ?? '';
      if (styleValue === null || domStyle !== styleValue) {
        return false;
      }
      staticPropCount += 1;
      continue;
    }

    if (key === 'value' || key === 'checked') {
      if ((el as HTMLElement & Record<string, unknown>)[key] !== value) {
        return false;
      }
      staticPropCount += 1;
      continue;
    }

    if (key === 'selected' && vnodeType === 'option') {
      if ((el as HTMLOptionElement).selected !== Boolean(value)) {
        return false;
      }
      staticPropCount += 1;
      continue;
    }

    if (el.getAttribute(key) !== String(value)) {
      return false;
    }

    staticPropCount += 1;
  }

  return el.attributes.length === staticPropCount;
}

function canReuseStaticSubtree(el: Element, vnode: DOMElement): boolean {
  if (
    typeof vnode.type !== 'string' ||
    !tagsEqualIgnoreCase(el.tagName, vnode.type)
  ) {
    return false;
  }

  const props = (vnode.props || {}) as Record<string, unknown>;
  if (!hasMatchingStaticProps(el, props, vnode.type)) {
    return false;
  }

  const slots = getStaticChildSlots(vnode);
  if (!slots) {
    return false;
  }

  if (el.childNodes.length !== slots.length) {
    return false;
  }

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const current = el.childNodes[index];
    if (!current) {
      return false;
    }

    if (slot.kind === 'text') {
      if (current.nodeType !== 3 || (current as Text).data !== slot.value) {
        return false;
      }
      continue;
    }

    if (!(current instanceof Element)) {
      return false;
    }

    if (!canReuseStaticSubtree(current, slot.value)) {
      return false;
    }
  }

  return true;
}

export function updateUnkeyedChildren(
  parent: Element,
  newChildren: unknown[],
  forceUpdate = false
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
      next.type as ComponentFunction,
      (((next as DOMElement).props ?? {}) as Record<string, unknown>) || {},
      parentNamespace,
      forceUpdate
    );
  };

  const trySyncControlBoundaryChild = (
    parent: Element,
    next: DOMElement
  ): boolean => {
    if (next.type !== __FOR_BOUNDARY__) {
      return false;
    }

    updateElementChildren(parent, next);
    return true;
  };

  // Check if newChildren has mixed content (both text/primitives and elements)
  const hasText = newChildren.some(
    (c) => typeof c === 'string' || typeof c === 'number'
  );
  const hasElements = newChildren.some((c) => _isDOMElement(c));
  const hasEmptyChildren = newChildren.some(isEmptyChild);
  const hasComponentChildren = newChildren.some(
    (c) => _isDOMElement(c) && typeof (c as DOMElement).type === 'function'
  );
  const hasNonElementDomChildren =
    parent.childNodes.length !== parent.children.length;

  // Fast path: same-count, pure-element update (the common large-list re-render).
  // Iterate parent.children by index directly to avoid the Array.from snapshot
  // allocation for large lists. replaceChild(x, child[i]) replaces in-place so
  // subsequent indices in the live HTMLCollection do NOT shift ├óΓé¼ΓÇ¥ safe to use.
  if (
    !hasEmptyChildren &&
    !hasText &&
    !hasComponentChildren &&
    !hasNonElementDomChildren &&
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
          updateElementFromVnode(current, next, true, forceUpdate);
        } else {
          const dom = createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else if (_isDOMElement(next)) {
        if (trySyncControlBoundaryChild(parent, next)) {
          continue;
        }

        const synced = trySyncComponentChild(current, next);
        if (synced && synced !== current) {
          teardownNodeSubtree(current);
        } else if (!synced) {
          const dom = createDOMNode(next, parentNamespace);
          if (dom) {
            teardownNodeSubtree(current);
            parent.replaceChild(dom, current);
          }
        }
      } else {
        const dom = createDOMNode(next, parentNamespace);
        if (dom) {
          teardownNodeSubtree(current);
          parent.replaceChild(dom, current);
        }
      }
    }
    return;
  }

  const existing = Array.from(parent.children);

  // Use childNodes whenever non-element DOM can participate in the sequence.
  // Component children can render text, comments, fragments, or elements, so
  // parent.children is not a safe positional view for those updates.
  if (
    hasText ||
    hasComponentChildren ||
    hasEmptyChildren ||
    hasNonElementDomChildren
  ) {
    const allNodes = Array.from(parent.childNodes);
    const max = Math.max(allNodes.length, newChildren.length);

    for (let i = 0; i < max; i++) {
      const currentNode = allNodes[i];
      const next = newChildren[i];
      const nextIsEmpty = isEmptyChild(next);

      // Remove extra existing nodes
      if (nextIsEmpty && currentNode) {
        teardownNodeSubtree(currentNode);
        currentNode.remove();
        continue;
      }

      // Append new children beyond existing length
      if (!currentNode && !nextIsEmpty) {
        const dom = createDOMNode(next, parentNamespace);
        if (dom) parent.appendChild(dom);
        continue;
      }

      if (!currentNode || nextIsEmpty) continue;

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
              updateElementFromVnode(currentEl, next, true, forceUpdate);
            } else {
              // Different type - replace
              const dom = createDOMNode(next, parentNamespace);
              if (dom) {
                teardownNodeSubtree(currentEl);
                parent.replaceChild(dom, currentNode);
              }
            }
          } else {
            if (trySyncControlBoundaryChild(parent, next)) {
              continue;
            }

            const synced = trySyncComponentChild(currentEl, next);
            if (synced && synced !== currentNode) {
              teardownNodeSubtree(currentEl);
            } else if (!synced) {
              const dom = createDOMNode(next, parentNamespace);
              if (dom) {
                teardownNodeSubtree(currentEl);
                parent.replaceChild(dom, currentNode);
              }
            }
          }
        } else {
          // Existing is text node - replace with element
          const dom = createDOMNode(next, parentNamespace);
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
    const nextIsEmpty = isEmptyChild(next);

    // Remove extra existing children
    if (nextIsEmpty && current) {
      // Clean up any component instance mounted on this node
      teardownNodeSubtree(current);
      current.remove();
      continue;
    }

    // Append new children beyond existing length
    if (!current && !nextIsEmpty) {
      const dom = createDOMNode(next, parentNamespace);
      if (dom) parent.appendChild(dom);
      continue;
    }

    if (!current || nextIsEmpty) continue;

    // Update existing element based on next vnode/primitive
    if (typeof next === 'string' || typeof next === 'number') {
      const textNode = document.createTextNode(String(next));
      teardownNodeSubtree(current);
      parent.replaceChild(textNode, current);
    } else if (_isDOMElement(next)) {
      if (typeof next.type === 'string') {
        // If element type matches, update in place; otherwise replace
        if (tagsEqualIgnoreCase(current.tagName, next.type)) {
          updateElementFromVnode(current, next, true, forceUpdate);
        } else {
          const dom = createDOMNode(next, parentNamespace);
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
          const dom = createDOMNode(next, parentNamespace);
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
