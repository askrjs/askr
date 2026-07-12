import type { ForCommitStrategy, ForState } from '../runtime';
import { keyedElements } from './keyed';
import { getMaterializedKey } from './utils';

export function getOrBuildDomKeyMap(
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

    itemInstance.scope.dom = currentDom;
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

  if (strategy === 'SWAP') {
    if (existing) {
      return;
    }
  }

  if (strategy === 'FULL_KEYED' && existing && removedNodes.length === 0) {
    return;
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
