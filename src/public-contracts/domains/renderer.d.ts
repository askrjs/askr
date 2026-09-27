import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { VNode, ContextFrame } from './context.js';
import { ComponentInstance } from './component.js';

/**
 * Internal DOM range shape shared by runtime ownership records and the
 * renderer. A singleton range uses the node itself for both anchors; a
 * multi-node or empty range uses deterministic comment anchors.
 */
interface DOMRange {
  start: Node;
  end: Node;
  single: boolean;
}

interface ChildScope {
  key: string | number;
  componentInstance: ComponentInstance;
  previousVnode: VNode | undefined;
  vnode: VNode | undefined;
  dom?: Node;
  /** @internal Fast singleton node plus an anchor-backed multi-node range. */
  range?: DOMRange;
  needsDomUpdate: boolean;
  hydrationPending: boolean;
  /** @internal Stable owner for validated intrinsic blueprints in list items. */
  blueprintOwner?: object;
  render(renderFn: () => VNode): VNode;
  markDirty(): void;
  dispose(): void;
}

interface ChildScopeOwnership {
  add(scope: ChildScope): void;
  delete(scope: ChildScope): void;
  bulkDispose(run: () => void): void;
}

/** @internal Snapshot used to restore a child scope after a failed commit. */
interface ChildScopeTransactionSnapshot {
  previousVnode: VNode | undefined;
  vnode: VNode | undefined;
  dom: Node | undefined;
  range: DOMRange | undefined;
  domTextData: string | undefined;
  needsDomUpdate: boolean;
  hydrationPending: boolean;
  renderFn: (() => VNode) | undefined;
  renderedOwnerFrame: ContextFrame | null;
}

export {
  DOMRange,
  ChildScope,
  ChildScopeOwnership,
  ChildScopeTransactionSnapshot,
};
