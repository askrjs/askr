import type { VNode } from './types';
import { extractKey, getMaterializedKey } from './utils';

export interface KeyedVnode {
  key: string | number;
  vnode: VNode;
}

export function extractKeyedVnodes(newChildren: VNode[]): KeyedVnode[] {
  const keyedVnodes: KeyedVnode[] = [];

  for (let i = 0; i < newChildren.length; i++) {
    const child = newChildren[i];
    const key = extractKey(child);
    if (key !== undefined) {
      keyedVnodes.push({ key, vnode: child });
    }
  }

  return keyedVnodes;
}

export function buildDOMKeyMap(parent: Element): Map<string | number, Element> {
  const keyMap = new Map<string | number, Element>();
  try {
    for (let el = parent.firstElementChild; el; el = el.nextElementSibling) {
      const key = getMaterializedKey(el);
      if (key !== undefined) {
        keyMap.set(key, el);
      }
    }
  } catch {
    // Ignore DOM access failures; callers can fall back to reconciliation.
  }
  return keyMap;
}
