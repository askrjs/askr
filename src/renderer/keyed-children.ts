import type { VNode } from './types';
import { extractKey, getMaterializedKey } from './utils';
import { getLogicalChildHosts } from './dom-range';

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
    for (const host of getLogicalChildHosts(parent)) {
      if (!(host instanceof Element)) continue;
      const key = getMaterializedKey(host);
      if (key !== undefined) {
        keyMap.set(key, host);
      }
    }
  } catch {
    // Ignore DOM access failures; callers can fall back to reconciliation.
  }
  return keyMap;
}
