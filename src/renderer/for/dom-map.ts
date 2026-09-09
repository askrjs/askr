import { writeScopeHost } from '../ownership/scope-host';
import { captureForItemTransactionSnapshot } from '../../runtime';
import {
  recordBenchCounter,
  resolveForKeyMapEffect,
  type ForCommitStrategy,
  type ForState,
} from '../../runtime';
import { keyedElements } from '../reconciliation/keyed';
import { getMaterializedKey } from '../utils';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

/** Whether publishing a successful commit can mutate the current keyed map. */
export function canSyncKeyedMapMutate(
  existing: Map<string | number, Element> | undefined,
  forState: ForState<unknown>,
  strategy: ForCommitStrategy,
  removedNodes: Node[]
): boolean {
  return (
    resolveForKeyMapEffect(existing, forState, strategy, removedNodes) !==
    'none'
  );
}

/**
 * Key map over the parent's raw element children.
 *
 * Shares the `keyedElements` cache with `getOrBuildLogicalChildKeyMap` in
 * children/element-children.ts, which walks logical child hosts and steps over
 * range interiors. See the note there.
 */
export function getOrBuildElementChildKeyMap(
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
      const key = getMaterializedKey(child);
      if (key !== undefined) {
        keyMap.set(key, child);
      }
    }
    if (keyMap.size > 0) {
      keyedElements.set(parent, keyMap);
    }
  }
  return keyMap.size > 0 ? keyMap : undefined;
}

export function hydrateExistingForDomInOrder(
  parent: Element,
  forState: ForState<unknown>
): boolean {
  if (parent.children.length !== forState.orderedKeys.length) {
    return false;
  }

  for (let i = 0; i < forState.orderedKeys.length; i += 1) {
    const itemKey = forState.orderedKeys[i];
    const itemInstance = forState.items.get(itemKey);
    const currentDom = parent.children[i];

    if (!itemInstance || getMaterializedKey(currentDom) !== itemKey) {
      return false;
    }

    writeScopeHost(itemInstance.scope, undefined, currentDom);
    itemInstance.scope.needsDomUpdate = true;
  }

  return true;
}

export function syncKeyedMapFromForState(
  parent: Element,
  forState: ForState<unknown>,
  strategy: ForCommitStrategy,
  removedNodes: Node[]
): void {
  const existing = keyedElements.get(parent);
  const effect = resolveForKeyMapEffect(
    existing,
    forState,
    strategy,
    removedNodes
  );

  if (effect === 'none') {
    return;
  }

  if (effect === 'prune' && existing) {
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

  if (effect === 'delete-one' && existing) {
    if (forState.pendingRemovedKey !== null) {
      if (existing.delete(forState.pendingRemovedKey)) {
        if (BENCH_BUILD_ENABLED) {
          recordBenchCounter('keyedMapEntriesDeleted');
        }
      }
      if (existing.size === 0) keyedElements.delete(parent);
    }
    return;
  }

  if (effect === 'clear') {
    if (existing) {
      existing.clear();
    }
    keyedElements.delete(parent);
    return;
  }

  if (effect === 'append' && existing) {
    for (let i = 0; i < forState.orderedKeys.length; i++) {
      const key = forState.orderedKeys[i];
      if (key === null || existing.has(key)) continue;
      const itemInstance = forState.items.get(key);
      if (itemInstance?.scope.dom instanceof Element) {
        existing.set(key, itemInstance.scope.dom);
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
      nextMap.set(key, itemInstance.scope.dom);
    }
  }

  if (nextMap.size > 0) {
    keyedElements.set(parent, nextMap);
  } else {
    keyedElements.delete(parent);
  }
}

/**
 * Claim the DOM a server render already produced for this list.
 *
 * Runs once per boundary, before the first commit can resolve its own nodes.
 * The ordered walk is tried first because it is exact; otherwise each item is
 * matched to an existing element by key, and anything unmatched is left for the
 * commit to build.
 */
export function adoptExistingForDom(
  parent: Element,
  forState: ForState<unknown>
): void {
  if (parent.children.length === forState.orderedKeys.length) {
    for (let index = 0; index < forState.orderedItems.length; index++) {
      const item = forState.orderedItems[index];
      if (item) {
        captureForItemTransactionSnapshot(forState, item);
      }
    }
  }

  if (hydrateExistingForDomInOrder(parent, forState)) {
    return;
  }

  const domKeyMap = getOrBuildElementChildKeyMap(parent);
  if (!domKeyMap) {
    return;
  }

  for (let i = 0; i < forState.orderedKeys.length; i++) {
    const itemKey = forState.orderedKeys[i];
    const itemInstance = forState.items.get(itemKey);
    if (!itemInstance || itemInstance.scope.dom) {
      continue;
    }

    const existingDom = domKeyMap.get(itemKey);
    if (!existingDom) {
      continue;
    }

    captureForItemTransactionSnapshot(forState, itemInstance);
    writeScopeHost(itemInstance.scope, undefined, existingDom);
    itemInstance.scope.needsDomUpdate = true;
  }
}
