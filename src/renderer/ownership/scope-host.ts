import type { DOMRange } from '../../common/dom-range';
import {
  getRuntimeEvaluation,
  getRuntimeCleanup,
  type ChildScope,
} from '../../runtime';
import type {
  ChildScopeHostSnapshot,
  ScopeBoundary,
} from '../../runtime/renderer-capabilities';
import type { InstanceHostNode } from '../dom-host';
import { indexOwnedRange, releaseRegisteredRange } from './ranges';

/** Both fields are indexes of the same renderer-owned boundary. */
export function writeScopeHost(
  scope: ChildScope,
  range: DOMRange | undefined,
  dom = range?.single ? range.start : undefined
): void {
  indexOwnedRange(scope, range);
  scope.range = range;
  scope.dom = dom;
}

export function clearChildScopeHost(scope: ChildScope): void {
  releaseRegisteredRange(scope);
  writeScopeHost(scope, undefined);
}

export function captureChildScopeHost(
  scope: ChildScope
): ChildScopeHostSnapshot {
  const dom = scope.dom;
  const range = scope.range;
  const text = dom?.nodeType === 3 ? (dom as Text).data : undefined;
  return {
    restore(target) {
      writeScopeHost(target, range, dom);
      if (text !== undefined && dom?.nodeType === 3) (dom as Text).data = text;
    },
  };
}

export function resolveScopeBoundary(scope: ChildScope): ScopeBoundary {
  const range =
    getRuntimeEvaluation().resolveChildScopeRange?.(scope) ?? scope.range;
  return { dom: range?.single ? range.start : scope.dom, range };
}

function appendScopeBoundaryNodes(
  dom: Node | undefined,
  range: DOMRange | undefined,
  nodes: Node[]
): void {
  if (range && !range.single) {
    nodes.push(range.start);
    for (
      let node = range.start.nextSibling;
      node && node !== range.end;
      node = node.nextSibling
    )
      nodes.push(node);
    nodes.push(range.end);
  } else if (dom) nodes.push(dom);
}

export function recordRemovedScopeBoundary(
  dom: Node | undefined,
  range: DOMRange | undefined,
  nodes: Node[],
  ranges: DOMRange[]
): void {
  if (range && !range.single) ranges.push(range);
  else if (dom) nodes.push(dom);
}

export function teardownScopeHost(
  dom: Node | undefined,
  range: DOMRange | undefined,
  onError?: (error: unknown) => void
): number {
  let count = 0;
  const teardown = (node: Node) => {
    try {
      getRuntimeCleanup().teardownNodeSubtree(node);
      count++;
    } catch (error) {
      if (!onError) throw error;
      onError(error);
    }
  };
  if (typeof Element !== 'undefined' && dom instanceof Element) teardown(dom);
  if (range && !range.single) {
    for (let node = range.start.nextSibling; node && node !== range.end;) {
      const next = node.nextSibling;
      teardown(node);
      node = next;
    }
  }
  return count;
}

export function hasUnmountedComponentHost(node: Node | undefined): boolean {
  if (!node) return false;
  const host = node as InstanceHostNode;
  if (host.__ASKR_INSTANCE?.owner.mounted === false) return true;
  return (
    host.__ASKR_INSTANCES?.some((instance) => !instance.owner.mounted) ?? false
  );
}

export function prepareScopeRemoval(
  scope: ChildScope,
  nodes: Node[],
  ranges: DOMRange[],
  rollbackNodes: Node[]
): ScopeBoundary {
  const boundary = resolveScopeBoundary(scope);
  appendScopeBoundaryNodes(boundary.dom, boundary.range, rollbackNodes);
  recordRemovedScopeBoundary(boundary.dom, boundary.range, nodes, ranges);
  return boundary;
}
