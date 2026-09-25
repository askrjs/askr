import type { VNode } from '../types';
import { performBulkPositionalKeyedTextUpdate } from '../children/children';
import { getRuntimeEnvValue } from '../env';
import { applyRendererFastPath } from './fastpath';
import { keyedElements, planKeyedReorderFastPath } from './keyed';
import type { KeyedVnode } from '../children/keyed-children';
import {
  canReuseIntrinsicElementInNamespace,
  getParentNamespace,
} from '../intrinsic/namespaces';
import {
  checkPropChanges,
  getMaterializedKey,
  recordFastPathStats,
} from '../utils';

type VnodeObj = VNode & { type?: unknown; props?: Record<string, unknown> };

/**
 * Run the first eligible keyed fast path. Each path decides eligibility up
 * front; once one starts it owns the update, so errors from user render code
 * propagate once instead of re-running the rows through another path.
 */
export function tryFastPaths(
  parent: Element,
  newChildren: VNode[],
  keyedVnodes: KeyedVnode[],
  oldKeyMap: Map<string | number, Element> | undefined
): Map<string | number, Element> | null {
  return (
    tryForcedPositionalBulkUpdate(parent, newChildren, keyedVnodes) ??
    tryRendererFastPath(parent, keyedVnodes, newChildren.length, oldKeyMap) ??
    tryPositionalBulkUpdate(parent, keyedVnodes)
  );
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

  if (!decision.useFastPath) return null;

  const map = applyRendererFastPath(parent, keyedVnodes, oldKeyMap);
  if (map) keyedElements.set(parent, map);
  return map;
}

function tryForcedPositionalBulkUpdate(
  parent: Element,
  newChildren: VNode[],
  keyedVnodes: KeyedVnode[]
): Map<string | number, Element> | null {
  if (getRuntimeEnvValue('ASKR_FORCE_BULK_POSREUSE') !== '1') return null;
  if (keyedVnodes.length === 0 || keyedVnodes.length !== newChildren.length) {
    return null;
  }

  const stats = performBulkPositionalKeyedTextUpdate(parent, keyedVnodes);
  recordFastPathStats(stats, 'bulkKeyedPositionalForced');

  return rebuildKeyedMap(parent);
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

  const stats = performBulkPositionalKeyedTextUpdate(parent, keyedVnodes);
  recordFastPathStats(stats, 'bulkKeyedPositionalHits');

  return rebuildKeyedMap(parent);
}

function countPositionalMatches(
  parent: Element,
  keyedVnodes: KeyedVnode[],
  parentNamespace: string | undefined
): number {
  let matchCount = 0;

  for (let i = 0; i < keyedVnodes.length; i++) {
    const vnode = keyedVnodes[i].vnode as VnodeObj;
    const expectedKey = keyedVnodes[i].key;

    if (!vnode || typeof vnode !== 'object' || typeof vnode.type !== 'string')
      continue;

    const el = parent.children[i] as Element | undefined;
    if (!el) continue;

    if (
      canReuseIntrinsicElementInNamespace(el, vnode.type, parentNamespace) &&
      getMaterializedKey(el) === expectedKey
    ) {
      matchCount++;
    }
  }

  return matchCount;
}

function hasPositionalPropChanges(
  parent: Element,
  keyedVnodes: KeyedVnode[]
): boolean {
  for (let i = 0; i < keyedVnodes.length; i++) {
    const vnode = keyedVnodes[i].vnode as VnodeObj;
    const el = parent.children[i] as Element | undefined;
    if (!el || !vnode || typeof vnode !== 'object') continue;

    if (checkPropChanges(el, vnode.props || {})) {
      return true;
    }
  }

  return false;
}

function rebuildKeyedMap(parent: Element): Map<string | number, Element> {
  const map = new Map<string | number, Element>();
  for (let el = parent.firstElementChild; el; el = el.nextElementSibling) {
    const key = getMaterializedKey(el);
    if (key !== undefined) {
      map.set(key, el);
    }
  }
  keyedElements.set(parent, map);
  return map;
}
