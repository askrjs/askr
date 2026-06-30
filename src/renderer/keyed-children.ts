import type { VNode } from './types';
import { extractKey } from './utils';

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
      const k = el.getAttribute('data-key');
      if (k !== null) {
        keyMap.set(k, el);
        const n = Number(k);
        if (!Number.isNaN(n)) keyMap.set(n, el);
      }
    }
  } catch {
    // Ignore DOM access failures; callers can fall back to reconciliation.
  }
  return keyMap;
}
