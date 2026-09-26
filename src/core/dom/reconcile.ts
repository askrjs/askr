/**
 * Child-list reconciliation.
 *
 * Matches a new list of child descriptors against a parent's committed
 * children (by key, else by type in order), asks the node kinds to patch
 * matches and create the rest, and records one operation that removes
 * departed children and places the remaining ones with a single
 * longest-increasing-subsequence move pass.
 *
 * This module knows lists, not node kinds: creating, patching, and releasing
 * a node go through the `NodeKinds` in the render context.
 */

import type { Owner } from '../reactive/owner';
import {
  descriptorType,
  normalizeChildren,
  type ChildDescriptor,
  type Key,
} from '../view/children';
import type { Pass } from './pass';
import {
  COMPONENT,
  HOST,
  PORTAL,
  collectDom,
  containerOf,
  endOf,
  firstDom,
  type Parent,
  type RNode,
} from './tree';
import { reportTeardown } from './teardown';

export interface NodeKinds {
  create(ctx: RenderContext, parent: Parent, child: ChildDescriptor): RNode;
  patch(ctx: RenderContext, node: RNode, child: ChildDescriptor): void;
  /** End the lifetimes a removed subtree owns (its DOM is already detached). */
  release(node: RNode, errors: unknown[]): void;
}

export interface RenderContext {
  readonly pass: Pass;
  /** Owner of lifetimes created while rendering these children. */
  readonly owner: Owner | null;
  /** Namespace for new elements. */
  readonly ns: string | null;
  readonly nodes: NodeKinds;
}

export function withOwner(
  ctx: RenderContext,
  owner: Owner | null
): RenderContext {
  return owner === ctx.owner ? ctx : { ...ctx, owner };
}

function typeOf(node: RNode): unknown {
  switch (node.kind) {
    case HOST:
      return node.tag;
    case COMPONENT:
      return node.instance.fn;
    case PORTAL:
      return node.target;
    default:
      return node.kind;
  }
}

function matches(node: RNode, child: ChildDescriptor): boolean {
  return node.kind === child.kind && typeOf(node) === descriptorType(child);
}

/**
 * Reconcile `parent`'s children against `value`.
 *
 * With `fresh`, `parent` is new: its children are built and, for an element,
 * appended to it directly. Otherwise the committed list is replaced by an
 * operation. Returns the new child list.
 */
export function reconcileChildren(
  ctx: RenderContext,
  parent: Parent,
  value: unknown,
  fresh: boolean
): RNode[] {
  const next = normalizeChildren(value);
  if (fresh) {
    const result = next.map((child) => ctx.nodes.create(ctx, parent, child));
    if (parent.kind === HOST) {
      for (const node of result) {
        for (const dom of collectDom(node)) parent.el.appendChild(dom);
      }
    }
    return result;
  }

  const previous = parent.children;
  const slot = ctx.pass.reserve();
  const index = indexChildren(previous);
  const used = new Uint8Array(previous.length);
  const sources = new Int32Array(next.length).fill(-1);
  const result: RNode[] = [];
  const cursors = new Map<unknown, number>();
  let seen: Set<Key> | null = null;

  for (let i = 0; i < next.length; i++) {
    const child = next[i];
    let match = -1;
    if (child.key !== undefined) {
      seen ??= new Set();
      if (seen.has(child.key)) {
        throw new Error(
          `[Askr] Duplicate key ${String(child.key)} among siblings.`
        );
      }
      seen.add(child.key);
      const at = index.keyed?.get(child.key);
      if (at !== undefined && !used[at] && matches(previous[at], child)) {
        match = at;
      }
    } else {
      const type = descriptorType(child);
      const bucket = index.unkeyed?.get(type);
      if (bucket) {
        let cursor = cursors.get(type) ?? 0;
        while (cursor < bucket.length && used[bucket[cursor]]) cursor++;
        if (
          cursor < bucket.length &&
          matches(previous[bucket[cursor]], child)
        ) {
          match = bucket[cursor];
          cursor++;
        }
        cursors.set(type, cursor);
      }
    }

    if (match >= 0) {
      used[match] = 1;
      sources[i] = match;
      ctx.nodes.patch(ctx, previous[match], child);
      result.push(previous[match]);
    } else {
      result.push(ctx.nodes.create(ctx, parent, child));
    }
  }

  const removed = previous.filter((_, i) => !used[i]);
  const stable = longestIncreasingSubsequence(sources);
  const nodes = ctx.nodes;
  ctx.pass.fill(slot, () => {
    const errors: unknown[] = [];
    for (const node of removed) {
      for (const dom of collectDom(node)) dom.parentNode?.removeChild(dom);
      nodes.release(node, errors);
    }
    parent.children = result;
    for (const node of result) node.parent = parent;
    placeChildren(parent, result, sources, stable);
    reportTeardown(errors);
  });
  return result;
}

interface ChildIndex {
  keyed: Map<Key, number> | null;
  unkeyed: Map<unknown, number[]> | null;
}

function indexChildren(children: RNode[]): ChildIndex {
  const index: ChildIndex = { keyed: null, unkeyed: null };
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.key !== undefined) {
      (index.keyed ??= new Map()).set(node.key, i);
      continue;
    }
    const type = typeOf(node);
    const bucket = (index.unkeyed ??= new Map()).get(type);
    if (bucket) bucket.push(i);
    else index.unkeyed.set(type, [i]);
  }
  return index;
}

/**
 * Put `children`'s DOM in order, walking backwards from the end so every
 * insertion has a settled reference node. Reused children on the stable
 * subsequence stay where they are.
 */
function placeChildren(
  parent: Parent,
  children: RNode[],
  sources: Int32Array,
  stable: Set<number>
): void {
  const container = containerOf(parent);
  let next: Node | null = endOf(parent);
  for (let i = children.length - 1; i >= 0; i--) {
    const node = children[i];
    if (sources[i] >= 0 && stable.has(i)) {
      next = firstDom(node) ?? next;
      continue;
    }
    const nodes = collectDom(node);
    for (let j = nodes.length - 1; j >= 0; j--) {
      const dom = nodes[j];
      if (dom.parentNode !== container || dom.nextSibling !== next) {
        container.insertBefore(dom, next);
      }
      next = dom;
    }
  }
}

/** Indices of a longest increasing run of `sources` values (ignoring -1). */
function longestIncreasingSubsequence(sources: Int32Array): Set<number> {
  const tails: number[] = [];
  const previous = new Int32Array(sources.length).fill(-1);
  for (let i = 0; i < sources.length; i++) {
    const value = sources[i];
    if (value < 0) continue;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (sources[tails[mid]] < value) low = mid + 1;
      else high = mid;
    }
    if (low > 0) previous[i] = tails[low - 1];
    tails[low] = i;
  }
  const result = new Set<number>();
  for (
    let i = tails.length ? tails[tails.length - 1] : -1;
    i >= 0;
    i = previous[i]
  ) {
    result.add(i);
  }
  return result;
}
