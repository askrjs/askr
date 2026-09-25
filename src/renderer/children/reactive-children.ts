import {
  createChildScope,
  disposeChildScope,
  rerenderChildScope,
  type ChildScope,
} from '../../runtime';
import {
  beginComponentScope,
  endComponentScope,
  FUNCTION_CHILD_NEEDS_COMPONENT,
  getCurrentComponentInstance,
  getExecutionContextFrame,
  getVNodeContextFrame,
  isRenderingProtectedBoundaryContent,
  liftFunctionChildren,
  markVNodeTreeWithContextFrame,
  readFunctionChildValue,
  routeRenderedOutputErrorToBoundary,
  runFunctionChildWithoutComponent,
  withContext,
  type ComponentInstance,
} from '../../runtime';
import { incDevCounter } from '../../runtime';
import {
  createFineGrainedEffect,
  restoreFineGrainedEffect,
  saveFineGrainedEffect,
  type FineGrainedEffectHandle,
} from '../../runtime';
import { captureBindingRollback } from '../props/reactive-bindings';
import {
  elementReactivePropsCleanup,
  getElementReactivePropsCleanupMap,
  REACTIVE_CHILDREN_KEY,
  teardownNodeSubtree,
  type ReactivePropCleanupEntry,
} from '../ownership/cleanup';
import { getParentNamespace } from '../intrinsic/namespaces';
import type { VNode } from '../types';
import {
  commitReactiveChildBoundaryEntryNodes,
  createReactiveChildBoundaryHost,
  disposeReactiveChildBoundaryNodes,
  materializeReactiveChildBoundaryNodes,
  syncReactiveChildExpectedNodes,
  syncReactiveChildSequenceNodes,
  syncReactiveScalarTextNodes,
  type ReactiveChildBoundarySequenceEntry,
  type ReactiveChildDOMHost,
} from './reactive-child-dom';
import {
  areReactiveChildBoundarySequenceSourcesEqual,
  areReactiveScalarChildSourcesEqual,
  canUpdateReactiveChildBoundarySequenceSource,
  collectReactiveChildValuesAsVNodes,
  getReactiveChildBoundarySequenceSource,
  getReactiveScalarChildSource,
  getSingleReactiveChildBoundarySource,
  normalizeOwnedReactiveTextValue,
  normalizeReactiveChildBoundaryVNode,
  normalizeReactiveScalarSequenceValues,
  type ReactiveChildBoundarySequenceSource,
  type ReactiveScalarChildSource,
} from './reactive-child-sources';

export type { ReactiveChildDOMHost } from './reactive-child-dom';

let reactiveChildScopeId = 0;

interface ScalarChildBinding {
  source: ReactiveScalarChildSource;
  effect: FineGrainedEffectHandle<unknown> | null;
}

function saveScalarChildBinding(
  binding: ScalarChildBinding,
  entries: unknown[]
): void {
  entries.push(binding, binding.source);
  saveFineGrainedEffect(entries, binding.effect!);
}

function restoreScalarChildBinding(entries: unknown[], index: number): void {
  const binding = entries[index] as ScalarChildBinding;
  binding.source = entries[index + 1] as ReactiveScalarChildSource;
  restoreFineGrainedEffect(entries, index + 2);
}

function getOrCreateElementReactiveCleanupMap(
  el: Element
): Map<string, ReactivePropCleanupEntry> {
  return getElementReactivePropsCleanupMap(el, true)!;
}

export function trySyncScalarChildSequenceInPlace(
  el: Element,
  children: unknown[],
  host: ReactiveChildDOMHost
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

  syncReactiveScalarTextNodes(el, children, normalized, host);
  return true;
}

/**
 * A failing function child belongs to the component that rendered it, like a
 * failing reactive prop: an ErrorBoundary's own children go to that boundary,
 * anything else to the nearest boundary above, and with no boundary the error
 * is thrown from the update that ran it.
 */
function createReactiveChildErrorRouter(): (error: unknown) => void {
  const owner = getCurrentComponentInstance();
  const protectedByOwner =
    !!owner && isRenderingProtectedBoundaryContent(owner);
  return (error) => {
    if (
      !owner ||
      !routeRenderedOutputErrorToBoundary(owner, error, protectedByOwner)
    ) {
      throw error;
    }
  };
}

/**
 * Read a function child bound directly to an element, without a component.
 * It runs in the context frame of the position it was written in. Returns
 * FUNCTION_CHILD_NEEDS_COMPONENT when the run asked for a component (a hook,
 * `Show`/`For`/`Case`, a resource): the binding then upgrades.
 */
export function readFunctionChildWithoutComponent(
  child: () => unknown
): unknown {
  const frame = getVNodeContextFrame(child) ?? null;
  const read = () =>
    runFunctionChildWithoutComponent(null, () => readFunctionChildValue(child));
  const value = frame
    ? withContext(getExecutionContextFrame(frame), read)
    : read();
  return value === FUNCTION_CHILD_NEEDS_COMPONENT
    ? value
    : markVNodeTreeWithContextFrame(value, frame);
}

/** Elements whose function children render as `FunctionChild` components. */
const functionChildComponentElements = new WeakSet<Element>();

/**
 * Render `children` with each function child as a mounted `FunctionChild`
 * component, owned by `owner` (the component that rendered the element).
 */
function renderFunctionChildComponents(
  el: Element,
  children: unknown,
  host: ReactiveChildDOMHost,
  owner: ComponentInstance | null
): void {
  const scope = beginComponentScope({ instance: owner });
  try {
    host.updateElementChildren(el, liftFunctionChildren(children) as VNode[]);
  } finally {
    endComponentScope(scope);
  }
}

/**
 * A text-bound function child needed a component: from now on the element's
 * function children render as components (see `syncReactiveScalarChild`).
 */
export function upgradeFunctionChildren(
  el: Element,
  children: unknown[],
  host: ReactiveChildDOMHost,
  owner: ComponentInstance | null
): void {
  functionChildComponentElements.add(el);
  const cleanupMap = getElementReactivePropsCleanupMap(el);
  const entry = cleanupMap?.get(REACTIVE_CHILDREN_KEY);
  if (entry) {
    cleanupMap!.delete(REACTIVE_CHILDREN_KEY);
    if (cleanupMap!.size === 0) elementReactivePropsCleanup.delete(el);
    entry.cleanup();
  }
  renderFunctionChildComponents(el, children, host, owner);
}

/** The element's children as written, from a text binding's slots. */
function scalarSourceChildren(source: ReactiveScalarChildSource): unknown[] {
  return source.map((slot) =>
    slot.kind === 'static' ? slot.value : slot.compute
  );
}

type ScalarChildSetup = {
  owner: ComponentInstance | null;
  /** The first run, during setup, needed a component; nothing was bound. */
  needsComponent: boolean;
  cleanup: () => void;
  updateFn: (nextSource: ReactiveScalarChildSource) => void;
};

/** Read every slot; the whole run needs a component if any slot does. */
function readScalarSlots(source: ReactiveScalarChildSource): unknown {
  const values: unknown[] = [];
  for (const slot of source) {
    if (slot.kind === 'static') {
      values.push(slot.value);
      continue;
    }
    const value = readFunctionChildWithoutComponent(slot.compute);
    if (value === FUNCTION_CHILD_NEEDS_COMPONENT) return value;
    values.push(value);
  }
  return values;
}

function setupReactiveScalarChild(
  el: Element,
  source: ReactiveScalarChildSource,
  host: ReactiveChildDOMHost
): ScalarChildSetup {
  let currentSource = source;
  let upgradeSource = () => currentSource;
  const routeReactiveChildError = createReactiveChildErrorRouter();
  const owner = getCurrentComponentInstance();
  // Set when the first run, which happens during setup, needs a component.
  let upgradeDuringSetup = false;
  let settingUp = true;
  const needsComponent = (): void => {
    if (settingUp) upgradeDuringSetup = true;
    else
      upgradeFunctionChildren(
        el,
        scalarSourceChildren(upgradeSource()),
        host,
        owner
      );
  };

  if (source.length === 1 && source[0]?.kind === 'dynamic') {
    let ownedTextNode =
      el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE
        ? (el.firstChild as Text)
        : null;
    const binding: ScalarChildBinding = { source, effect: null };
    upgradeSource = () => binding.source;

    binding.effect = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => {
        const currentSlot = binding.source[0];
        if (!currentSlot || currentSlot.kind !== 'dynamic') {
          throw new Error(
            '[Askr] Direct reactive text bindings require a single dynamic slot.'
          );
        }

        const rawValue = readFunctionChildWithoutComponent(currentSlot.compute);
        if (rawValue === FUNCTION_CHILD_NEEDS_COMPONENT) return rawValue;
        const normalized = normalizeOwnedReactiveTextValue(rawValue);
        return normalized ?? (rawValue as string);
      },
      commit: (value) => {
        if (value === FUNCTION_CHILD_NEEDS_COMPONENT) {
          needsComponent();
          return;
        }
        const normalized = normalizeOwnedReactiveTextValue(value);

        if (normalized === null) {
          ownedTextNode = null;
          host.updateElementChildren(
            el,
            value as unknown as VNode | VNode[] | undefined
          );
          return;
        }

        if (!ownedTextNode && el.childNodes.length === 0) {
          ownedTextNode = el.ownerDocument.createTextNode(normalized);
          el.appendChild(ownedTextNode);
          return;
        }

        if (
          !ownedTextNode ||
          el.childNodes.length !== 1 ||
          el.firstChild !== ownedTextNode
        ) {
          host.updateElementChildren(el, normalized);
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
      onError: routeReactiveChildError,
    });

    settingUp = false;
    return {
      owner,
      needsComponent: upgradeDuringSetup,
      cleanup: () => {
        binding.effect?.cleanup();
        binding.effect = null;
      },
      updateFn: (nextSource: ReactiveScalarChildSource) => {
        const effectHandle = binding.effect;
        if (!effectHandle) {
          return;
        }

        captureBindingRollback(
          binding,
          saveScalarChildBinding,
          restoreScalarChildBinding
        );
        binding.source = nextSource;
        effectHandle.updateCompute(() => {
          const currentSlot = binding.source[0];
          if (!currentSlot || currentSlot.kind !== 'dynamic') {
            throw new Error(
              '[Askr] Direct reactive text bindings require a single dynamic slot.'
            );
          }

          const rawValue = readFunctionChildWithoutComponent(
            currentSlot.compute
          );
          if (rawValue === FUNCTION_CHILD_NEEDS_COMPONENT) return rawValue;
          const normalized = normalizeOwnedReactiveTextValue(rawValue);
          return normalized ?? (rawValue as string);
        });
      },
    };
  }

  let effectHandle: FineGrainedEffectHandle<unknown> | null =
    createFineGrainedEffect({
      lane: 'reactive',
      compute: () => readScalarSlots(currentSource),
      commit: (values) => {
        if (values === FUNCTION_CHILD_NEEDS_COMPONENT) {
          needsComponent();
          return;
        }
        if (!Array.isArray(values)) {
          throw new Error(
            '[Askr] Reactive scalar children must evaluate to a slot array.'
          );
        }

        const normalized = normalizeReactiveScalarSequenceValues(values);
        if (normalized) {
          syncReactiveScalarTextNodes(el, values, normalized, host);
          return;
        }

        const nextChildren: VNode[] = [];
        collectReactiveChildValuesAsVNodes(values, nextChildren);

        const boundaryHost = createReactiveChildBoundaryHost(el);
        for (let node = el.firstChild; node;) {
          const next = node.nextSibling;
          boundaryHost.appendChild(node);
          node = next;
        }

        host.updateElementChildren(boundaryHost, nextChildren);
        syncReactiveChildExpectedNodes(el, Array.from(boundaryHost.childNodes));
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
      onError: routeReactiveChildError,
    });

  settingUp = false;
  return {
    owner,
    needsComponent: upgradeDuringSetup,
    cleanup: () => {
      effectHandle?.cleanup();
      effectHandle = null;
    },
    updateFn: (nextSource: ReactiveScalarChildSource) => {
      if (!effectHandle) {
        return;
      }

      currentSource = nextSource;
      effectHandle.updateCompute(() => readScalarSlots(currentSource));
    },
  };
}

/** @internal Create a standalone scalar-child binding for rollback restoration. */
export function createReactiveScalarChildCleanupEntry(
  el: Element,
  source: ReactiveScalarChildSource,
  host: ReactiveChildDOMHost
): ReactivePropCleanupEntry {
  const reactive = setupReactiveScalarChild(el, source, host);
  if (reactive.needsComponent) {
    reactive.cleanup();
    upgradeFunctionChildren(
      el,
      scalarSourceChildren(source),
      host,
      reactive.owner
    );
    return { cleanup() {}, fnRef: null };
  }
  return {
    cleanup: reactive.cleanup,
    updateFn: (nextValue) => {
      reactive.updateFn(nextValue as ReactiveScalarChildSource);
    },
    restoreFn: (nextValue) =>
      createReactiveScalarChildCleanupEntry(
        el,
        nextValue as ReactiveScalarChildSource,
        host
      ),
    fnRef: source,
  };
}

type BoundaryChildBinding = {
  owner: ComponentInstance | null;
  /** The first render, during setup, needed a component; see ScalarChildBinding. */
  needsComponent: boolean;
  cleanup: () => void;
  updateFn: (nextValue: unknown) => void;
};

/** A function child's scope renders in the context of the position it was written in. */
function setFunctionChildScopeFrame(scope: ChildScope, child: unknown): void {
  const frame = getVNodeContextFrame(child);
  if (frame) scope.componentInstance.ownerFrame = frame;
}

/**
 * Render a function child in its child scope. The scope counts as a
 * component only while the function itself runs; a run that asks for one
 * renders nothing and requests the upgrade, which runs once the render has
 * been committed.
 */
function readFunctionChildInScope(
  scope: ChildScope,
  child: () => unknown,
  requestUpgrade: () => void
): VNode {
  const value = runFunctionChildWithoutComponent(scope.componentInstance, () =>
    readFunctionChildValue(child)
  );
  if (value === FUNCTION_CHILD_NEEDS_COMPONENT) {
    requestUpgrade();
    return null as unknown as VNode;
  }
  return normalizeReactiveChildBoundaryVNode(value as VNode);
}

function createBoundaryUpgrade(
  el: Element,
  host: ReactiveChildDOMHost,
  owner: ComponentInstance | null,
  children: () => unknown[]
) {
  let requested = false;
  let settingUp = true;
  let done = false;
  return {
    request(): void {
      requested = true;
    },
    /** Whether setup ended with an upgrade pending (the caller performs it). */
    finishSetup(): boolean {
      settingUp = false;
      return requested;
    },
    afterCommit(): void {
      if (!requested || settingUp || done) return;
      done = true;
      upgradeFunctionChildren(el, children(), host, owner);
    },
  };
}

function setupReactiveChildBoundary(
  el: Element,
  childFn: () => VNode,
  host: ReactiveChildDOMHost
): BoundaryChildBinding {
  let currentChildFn = childFn;
  const parentInstance = getCurrentComponentInstance();
  const upgrade = createBoundaryUpgrade(el, host, parentInstance, () => [
    currentChildFn,
  ]);
  const entry: { scope: ChildScope; nodes: Node[] } = {
    scope: createChildScope(
      parentInstance,
      `__reactive-child__:${(reactiveChildScopeId += 1)}`,
      () => {
        const expectedNodes = commitReactiveChildBoundaryEntryNodes(
          el,
          entry,
          host
        );
        syncReactiveChildExpectedNodes(el, expectedNodes);
        upgrade.afterCommit();
      }
    ),
    nodes: [],
  };

  setFunctionChildScopeFrame(entry.scope, currentChildFn);
  entry.scope.render(() =>
    readFunctionChildInScope(entry.scope, currentChildFn, upgrade.request)
  );
  syncReactiveChildExpectedNodes(
    el,
    commitReactiveChildBoundaryEntryNodes(el, entry, host)
  );

  return {
    owner: parentInstance,
    needsComponent: upgrade.finishSetup(),
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
        teardownNodeSubtree(dom);
        el.removeChild(dom);
      }
    },
    updateFn: (nextValue: unknown) => {
      currentChildFn = nextValue as () => VNode;
      setFunctionChildScopeFrame(entry.scope, currentChildFn);
      rerenderChildScope(entry.scope);
      const expectedNodes = commitReactiveChildBoundaryEntryNodes(
        el,
        entry,
        host
      );
      syncReactiveChildExpectedNodes(el, expectedNodes);
      upgrade.afterCommit();
    },
  };
}

function setupReactiveChildBoundarySequence(
  el: Element,
  source: ReactiveChildBoundarySequenceSource,
  host: ReactiveChildDOMHost
): BoundaryChildBinding {
  let currentSource = source;
  const parentInstance = getCurrentComponentInstance();
  const upgrade = createBoundaryUpgrade(el, host, parentInstance, () =>
    currentSource.map((slot) =>
      slot.kind === 'dynamic' ? slot.compute : slot.value
    )
  );
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
    syncReactiveChildSequenceNodes(el, entries, host);
    upgrade.afterCommit();
  };

  const parentNamespace = getParentNamespace(el);

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
          parentNamespace,
          host
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
    setFunctionChildScopeFrame(
      dynamicEntry.entry.scope,
      (currentSource[dynamicEntry.index] as { compute: () => VNode }).compute
    );
    dynamicEntry.entry.scope.render(() =>
      readFunctionChildInScope(
        dynamicEntry.entry.scope,
        (
          currentSource[dynamicEntry.index] as {
            kind: 'dynamic';
            compute: () => VNode;
          }
        ).compute,
        upgrade.request
      )
    );
  }

  syncSequence();

  return {
    owner: parentInstance,
    needsComponent: upgrade.finishSetup(),
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
          teardownNodeSubtree(dom);
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
        setFunctionChildScopeFrame(
          dynamicEntry.entry.scope,
          (currentSource[dynamicEntry.index] as { compute: () => VNode })
            .compute
        );
        rerenderChildScope(dynamicEntry.entry.scope);
      }
      syncSequence();
    },
  };
}

export function syncReactiveScalarChild(
  el: Element,
  children: unknown,
  host: ReactiveChildDOMHost
): boolean {
  const cleanupMap = getElementReactivePropsCleanupMap(el);
  const existingReactiveEntry = cleanupMap?.get(REACTIVE_CHILDREN_KEY);

  // Once a function child of `el` has needed a component, its function
  // children render as `FunctionChild` components.
  if (functionChildComponentElements.has(el)) {
    if (existingReactiveEntry) {
      existingReactiveEntry.cleanup();
      cleanupMap?.delete(REACTIVE_CHILDREN_KEY);
      if (cleanupMap && cleanupMap.size === 0) {
        elementReactivePropsCleanup.delete(el);
      }
    }
    renderFunctionChildComponents(
      el,
      children,
      host,
      getCurrentComponentInstance()
    );
    return true;
  }

  const reactiveChildSource = getReactiveScalarChildSource(children);
  const reactiveChildBoundary = getSingleReactiveChildBoundarySource(children);
  const reactiveChildBoundarySequence =
    getReactiveChildBoundarySequenceSource(children);

  if (
    !reactiveChildSource &&
    !reactiveChildBoundary &&
    !reactiveChildBoundarySequence
  ) {
    if (existingReactiveEntry) {
      existingReactiveEntry.cleanup();
      cleanupMap?.delete(REACTIVE_CHILDREN_KEY);
      if (cleanupMap && cleanupMap.size === 0) {
        elementReactivePropsCleanup.delete(el);
      }
    }

    return false;
  }

  if (reactiveChildSource && !reactiveChildBoundarySequence) {
    if (
      existingReactiveEntry?.groupedScalar &&
      existingReactiveEntry.updateFn &&
      reactiveChildSource.length === 1 &&
      reactiveChildSource[0]?.kind === 'dynamic'
    ) {
      const nextCompute = reactiveChildSource[0].compute;
      existingReactiveEntry.updateFn(nextCompute);
      existingReactiveEntry.fnRef = nextCompute;
      return true;
    }

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
      const entry = createReactiveScalarChildCleanupEntry(
        el,
        reactiveChildSource,
        host
      );
      if (!functionChildComponentElements.has(el)) {
        getOrCreateElementReactiveCleanupMap(el).set(
          REACTIVE_CHILDREN_KEY,
          entry
        );
      }
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
      reactiveChildBoundarySequence,
      host
    );
    if (reactive.needsComponent) {
      reactive.cleanup();
      upgradeFunctionChildren(
        el,
        reactiveChildBoundarySequence.map((slot) =>
          slot.kind === 'dynamic' ? slot.compute : slot.value
        ),
        host,
        reactive.owner
      );
      return true;
    }
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

  const reactive = setupReactiveChildBoundary(el, reactiveChildBoundary, host);
  if (reactive.needsComponent) {
    reactive.cleanup();
    upgradeFunctionChildren(el, [reactiveChildBoundary], host, reactive.owner);
    return true;
  }
  getOrCreateElementReactiveCleanupMap(el).set(REACTIVE_CHILDREN_KEY, {
    cleanup: reactive.cleanup,
    updateFn: reactive.updateFn,
    fnRef: reactiveChildBoundary,
  });
  return true;
}
