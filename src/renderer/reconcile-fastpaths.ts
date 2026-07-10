import type { VNode } from './types';
import { performBulkPositionalKeyedTextUpdate } from './children';
import { getRuntimeEnv } from './env';
import { applyRendererFastPath } from './fastpath';
import { keyedElements, planKeyedReorderFastPath } from './keyed';
import type { KeyedVnode } from './keyed-children';
import {
  canReuseIntrinsicElementInNamespace,
  getParentNamespace,
} from './namespaces';
import {
  checkPropChanges,
  getMaterializedKey,
  recordFastPathStats,
} from './utils';

type VnodeObj = VNode & { type?: unknown; props?: Record<string, unknown> };

export function tryFastPaths(
  parent: Element,
  newChildren: VNode[],
  keyedVnodes: KeyedVnode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> | null {
  try {
    const forcedResult = tryForcedPositionalBulkUpdate(
      parent,
      newChildren,
      keyedVnodes
    );
    if (forcedResult) {
      return forcedResult;
    }

    const rendererResult = tryRendererFastPath(
      parent,
      keyedVnodes,
      newChildren.length,
      oldKeyMap
    );
    if (rendererResult) {
      return rendererResult;
    }

    const positionalResult = tryPositionalBulkUpdate(parent, keyedVnodes);
    if (positionalResult) {
      return positionalResult;
    }
  } catch {
    // Fall through to full reconciliation.
  }

  return null;
}

function tryRendererFastPath(
  parent: Element,
  keyedVnodes: KeyedVnode[],
  totalChildren: number,
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> | null {
  const decision = planKeyedReorderFastPath(
    parent,
    keyedVnodes,
    totalChildren,
    oldKeyMap
  );

  if (decision.useFastPath) {
    try {
      const map = applyRendererFastPath(parent, keyedVnodes, oldKeyMap);
      if (map) {
        keyedElements.set(parent, map);
        return map;
      }
    } catch {
      // Fall through.
    }
  }

  return null;
}

function tryForcedPositionalBulkUpdate(
  parent: Element,
  newChildren: VNode[],
  keyedVnodes: KeyedVnode[]
): Map<string | number, Element> | null {
  if (getRuntimeEnv().ASKR_FORCE_BULK_POSREUSE !== '1') return null;
  if (keyedVnodes.length === 0 || keyedVnodes.length !== newChildren.length) {
    return null;
  }

  try {
    const stats = performBulkPositionalKeyedTextUpdate(parent, keyedVnodes);
    recordFastPathStats(stats, 'bulkKeyedPositionalForced');

    rebuildKeyedMap(parent);
    return keyedElements.get(parent) as Map<string | number, Element>;
  } catch {
    return null;
  }
}

function tryPositionalBulkUpdate(
  parent: Element,
  keyedVnodes: KeyedVnode[]
): Map<string | number, Element> | null {
  const total = keyedVnodes.length;
  if (total < 10) return null;

  if (parent.children.length !== total) {
    return null;
  }

  const parentNamespace = getParentNamespace(parent);
  const matchCount = countPositionalMatches(
    parent,
    keyedVnodes,
    parentNamespace
  );
  const matchFraction = matchCount / total;

  if (keyedVnodes.length > 0) {
    if (matchCount !== total && matchFraction >= 0.1) {
      return null;
    }
  } else if (matchFraction < 0.9) {
    return null;
  }

  if (hasPositionalPropChanges(parent, keyedVnodes)) {
    return null;
  }

  try {
    const stats = performBulkPositionalKeyedTextUpdate(parent, keyedVnodes);
    recordFastPathStats(stats, 'bulkKeyedPositionalHits');

    rebuildKeyedMap(parent);
    return keyedElements.get(parent) as Map<string | number, Element>;
  } catch {
    return null;
  }
}

function countPositionalMatches(
  parent: Element,
  keyedVnodes: KeyedVnode[],
  parentNamespace: string | undefined
): number {
  let matchCount = 0;

  try {
    for (let i = 0; i < keyedVnodes.length; i++) {
      const vnode = keyedVnodes[i].vnode as VnodeObj;
      const expectedKey = keyedVnodes[i].key;

      if (!vnode || typeof vnode !== 'object' || typeof vnode.type !== 'string')
        continue;

      const el = parent.children[i] as Element | undefined;
      if (!el) continue;

      if (
        canReuseIntrinsicElementInNamespace(el, vnode.type, parentNamespace)
      ) {
        const keyMatches = getMaterializedKey(el) === expectedKey;

        if (keyMatches) {
          matchCount++;
        }
      }
    }
  } catch {
    // Ignore.
  }

  return matchCount;
}

function hasPositionalPropChanges(
  parent: Element,
  keyedVnodes: KeyedVnode[]
): boolean {
  try {
    for (let i = 0; i < keyedVnodes.length; i++) {
      const vnode = keyedVnodes[i].vnode as VnodeObj;
      const el = parent.children[i] as Element | undefined;
      if (!el || !vnode || typeof vnode !== 'object') continue;

      if (checkPropChanges(el, vnode.props || {})) {
        return true;
      }
    }
  } catch {
    return true;
  }

  return false;
}

function rebuildKeyedMap(parent: Element): void {
  try {
    const map = new Map<string | number, Element>();
    for (let el = parent.firstElementChild; el; el = el.nextElementSibling) {
      const key = getMaterializedKey(el);
      if (key !== undefined) {
        map.set(key, el);
      }
    }
    keyedElements.set(parent, map);
  } catch {
    // Ignore.
  }
}
