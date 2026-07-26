import { logger } from "../common/logger";
import {
  createChildScope,
  disposeChildScope,
  rerenderChildScope,
  type ChildScope,
} from "../runtime";
import { getCurrentInstance } from "../runtime";
import { incDevCounter } from "../runtime";
import { createFineGrainedEffect, type FineGrainedEffectHandle } from "../runtime";
import {
  elementReactivePropsCleanup,
  getElementReactivePropsCleanupMap,
  REACTIVE_CHILDREN_KEY,
  teardownNodeSubtree,
  type ReactivePropCleanupEntry,
} from "./cleanup";
import { getRuntimeEnv } from "./env";
import { getParentNamespace } from "./namespaces";
import type { VNode } from "./types";
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
} from "./reactive-child-dom";
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
} from "./reactive-child-sources";

export type { ReactiveChildDOMHost } from "./reactive-child-dom";

let reactiveChildScopeId = 0;

function getOrCreateElementReactiveCleanupMap(el: Element): Map<string, ReactivePropCleanupEntry> {
  return getElementReactivePropsCleanupMap(el, true)!;
}

export function trySyncScalarChildSequenceInPlace(
  el: Element,
  children: unknown[],
  host: ReactiveChildDOMHost,
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

function setupReactiveScalarChild(
  el: Element,
  source: ReactiveScalarChildSource,
  host: ReactiveChildDOMHost,
): {
  cleanup: () => void;
  updateFn: (nextSource: ReactiveScalarChildSource) => void;
} {
  let currentSource = source;

  if (source.length === 1 && source[0]?.kind === "dynamic") {
    let ownedTextNode =
      el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE
        ? (el.firstChild as Text)
        : null;

    let effectHandle: FineGrainedEffectHandle<string> | null = createFineGrainedEffect({
      lane: "reactive",
      compute: () => {
        const currentSlot = currentSource[0];
        if (!currentSlot || currentSlot.kind !== "dynamic") {
          throw new Error("[Askr] Direct reactive text bindings require a single dynamic slot.");
        }

        const rawValue = currentSlot.compute();
        const normalized = normalizeOwnedReactiveTextValue(rawValue);
        return normalized ?? (rawValue as string);
      },
      commit: (value) => {
        const normalized = normalizeOwnedReactiveTextValue(value);

        if (normalized === null) {
          ownedTextNode = null;
          host.updateElementChildren(el, value as unknown as VNode | VNode[] | undefined);
          return;
        }

        if (!ownedTextNode && el.childNodes.length === 0) {
          ownedTextNode = el.ownerDocument.createTextNode(normalized);
          el.appendChild(ownedTextNode);
          return;
        }

        if (!ownedTextNode || el.childNodes.length !== 1 || el.firstChild !== ownedTextNode) {
          host.updateElementChildren(el, normalized);
          ownedTextNode =
            el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE
              ? (el.firstChild as Text)
              : null;
        }

        if (!ownedTextNode) {
          return;
        }

        if (ownedTextNode.data !== normalized) {
          ownedTextNode.data = normalized;
          incDevCounter("textNodeWrites");
        }
      },
      onError: (err) => {
        if (getRuntimeEnv().NODE_ENV !== "production") {
          logger.warn("[Askr] Reactive child update failed:", err);
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
          if (!currentSlot || currentSlot.kind !== "dynamic") {
            throw new Error("[Askr] Direct reactive text bindings require a single dynamic slot.");
          }

          const rawValue = currentSlot.compute();
          const normalized = normalizeOwnedReactiveTextValue(rawValue);
          return normalized ?? (rawValue as string);
        });
      },
    };
  }

  let effectHandle: FineGrainedEffectHandle<unknown> | null = createFineGrainedEffect({
    lane: "reactive",
    compute: () =>
      currentSource.map((slot) => (slot.kind === "static" ? slot.value : slot.compute())),
    commit: (values) => {
      if (!Array.isArray(values)) {
        throw new Error("[Askr] Reactive scalar children must evaluate to a slot array.");
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

      const previousNormalized = normalizeReactiveScalarSequenceValues(previousValue);
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
      if (getRuntimeEnv().NODE_ENV !== "production") {
        logger.warn("[Askr] Reactive child update failed:", err);
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
        currentSource.map((slot) => (slot.kind === "static" ? slot.value : slot.compute())),
      );
    },
  };
}

/** @internal Create a standalone scalar-child binding for rollback restoration. */
export function createReactiveScalarChildCleanupEntry(
  el: Element,
  source: ReactiveScalarChildSource,
  host: ReactiveChildDOMHost,
): ReactivePropCleanupEntry {
  const reactive = setupReactiveScalarChild(el, source, host);
  return {
    cleanup: reactive.cleanup,
    updateFn: (nextValue) => {
      reactive.updateFn(nextValue as ReactiveScalarChildSource);
    },
    restoreFn: (nextValue) =>
      createReactiveScalarChildCleanupEntry(el, nextValue as ReactiveScalarChildSource, host),
    fnRef: source,
  };
}

function setupReactiveChildBoundary(
  el: Element,
  childFn: () => VNode,
  host: ReactiveChildDOMHost,
): { cleanup: () => void; updateFn: (nextValue: unknown) => void } {
  let currentChildFn = childFn;
  const parentInstance = getCurrentInstance();
  const entry: { scope: ChildScope; nodes: Node[] } = {
    scope: createChildScope(
      parentInstance,
      `__reactive-child__:${(reactiveChildScopeId += 1)}`,
      () => {
        const expectedNodes = commitReactiveChildBoundaryEntryNodes(el, entry, host);
        syncReactiveChildExpectedNodes(el, expectedNodes);
      },
    ),
    nodes: [],
  };

  entry.scope.render(() => normalizeReactiveChildBoundaryVNode(currentChildFn()));
  syncReactiveChildExpectedNodes(el, commitReactiveChildBoundaryEntryNodes(el, entry, host));

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
        teardownNodeSubtree(dom);
        el.removeChild(dom);
      }
    },
    updateFn: (nextValue: unknown) => {
      currentChildFn = nextValue as () => VNode;
      rerenderChildScope(entry.scope);
      const expectedNodes = commitReactiveChildBoundaryEntryNodes(el, entry, host);
      syncReactiveChildExpectedNodes(el, expectedNodes);
    },
  };
}

function setupReactiveChildBoundarySequence(
  el: Element,
  source: ReactiveChildBoundarySequenceSource,
  host: ReactiveChildDOMHost,
): { cleanup: () => void; updateFn: (nextValue: unknown) => void } {
  let currentSource = source;
  const parentInstance = getCurrentInstance();
  const entries: ReactiveChildBoundarySequenceEntry[] = [];
  const dynamicEntries: Array<{
    index: number;
    entry: Extract<ReactiveChildBoundarySequenceEntry, { kind: "dynamic" }>;
  }> = [];

  if (!currentSource.some((slot) => slot.kind === "dynamic")) {
    throw new Error("[Askr] Reactive child boundary sequence requires at least one dynamic slot.");
  }

  const syncSequence = () => {
    syncReactiveChildSequenceNodes(el, entries, host);
  };

  const parentNamespace = getParentNamespace(el);

  for (let index = 0; index < currentSource.length; index += 1) {
    const slot = currentSource[index];
    if (!slot) {
      continue;
    }

    if (slot.kind === "static-text") {
      entries.push({
        kind: "static",
        nodes: [document.createTextNode(slot.value)],
      });
      continue;
    }

    if (slot.kind === "static-node") {
      entries.push({
        kind: "static",
        nodes: materializeReactiveChildBoundaryNodes(slot.value, parentNamespace, host),
      });
      continue;
    }

    const scope = createChildScope(
      parentInstance,
      `__reactive-child-seq__:${(reactiveChildScopeId += 1)}`,
      syncSequence,
    );

    const dynamicEntry: Extract<ReactiveChildBoundarySequenceEntry, { kind: "dynamic" }> = {
      kind: "dynamic",
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
            kind: "dynamic";
            compute: () => VNode;
          }
        ).compute(),
      ),
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
          teardownNodeSubtree(dom);
          el.removeChild(dom);
        }
      }

      for (const entry of entries) {
        if (entry.kind === "static") {
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

export function syncReactiveScalarChild(
  el: Element,
  children: unknown,
  host: ReactiveChildDOMHost,
): boolean {
  const reactiveChildSource = getReactiveScalarChildSource(children);
  const reactiveChildBoundary = getSingleReactiveChildBoundarySource(children);
  const reactiveChildBoundarySequence = getReactiveChildBoundarySequenceSource(children);
  const cleanupMap = getElementReactivePropsCleanupMap(el);
  const existingReactiveEntry = cleanupMap?.get(REACTIVE_CHILDREN_KEY);

  if (!reactiveChildSource && !reactiveChildBoundary && !reactiveChildBoundarySequence) {
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
      reactiveChildSource[0]?.kind === "dynamic"
    ) {
      const nextCompute = reactiveChildSource[0].compute;
      existingReactiveEntry.updateFn(nextCompute);
      existingReactiveEntry.fnRef = nextCompute;
      return true;
    }

    if (
      existingReactiveEntry &&
      Array.isArray(existingReactiveEntry.fnRef) &&
      areReactiveScalarChildSourcesEqual(existingReactiveEntry.fnRef, reactiveChildSource)
    ) {
      return true;
    }

    if (existingReactiveEntry?.updateFn && Array.isArray(existingReactiveEntry.fnRef)) {
      existingReactiveEntry.updateFn(reactiveChildSource);
      existingReactiveEntry.fnRef = reactiveChildSource;
      return true;
    }

    existingReactiveEntry?.cleanup();

    try {
      getOrCreateElementReactiveCleanupMap(el).set(
        REACTIVE_CHILDREN_KEY,
        createReactiveScalarChildCleanupEntry(el, reactiveChildSource, host),
      );
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
        reactiveChildBoundarySequence,
      )
    ) {
      return true;
    }

    if (
      existingReactiveEntry?.updateFn &&
      Array.isArray(existingReactiveEntry.fnRef) &&
      canUpdateReactiveChildBoundarySequenceSource(
        existingReactiveEntry.fnRef,
        reactiveChildBoundarySequence,
      )
    ) {
      existingReactiveEntry.updateFn(reactiveChildBoundarySequence);
      existingReactiveEntry.fnRef = reactiveChildBoundarySequence;
      return true;
    }

    existingReactiveEntry?.cleanup();

    const reactive = setupReactiveChildBoundarySequence(el, reactiveChildBoundarySequence, host);
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

  if (existingReactiveEntry?.updateFn && !Array.isArray(existingReactiveEntry.fnRef)) {
    existingReactiveEntry.updateFn(reactiveChildBoundary);
    existingReactiveEntry.fnRef = reactiveChildBoundary;
    return true;
  }

  existingReactiveEntry?.cleanup();

  if (!reactiveChildBoundary) {
    return false;
  }

  const reactive = setupReactiveChildBoundary(el, reactiveChildBoundary, host);
  getOrCreateElementReactiveCleanupMap(el).set(REACTIVE_CHILDREN_KEY, {
    cleanup: reactive.cleanup,
    updateFn: reactive.updateFn,
    fnRef: reactiveChildBoundary,
  });
  return true;
}
