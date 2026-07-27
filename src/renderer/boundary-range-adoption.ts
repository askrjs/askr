import { isFragmentType } from '../common/jsx';
import type { DOMRange } from '../common/dom-range';
import {
  enterDomCommitScope,
  restoreDomCommitScope,
  type ChildScope,
  type ComponentFunction,
} from '../runtime';
import {
  createDetachedRange,
  createEmptyRange,
  createSingleNodeRange,
  findRangeEnd,
  getRangeNodes,
  isRangeStart,
} from './dom-range';
import { getParentNamespace } from './namespaces';
import { _isDOMElement, type DOMElement, type VNode } from './types';

export type BoundaryRangeDOMHost = {
  createDOMNode(vnode: unknown, parentNamespace?: string): Node | null;
  createResultNodeWithBlueprint(
    owner: object,
    vnode: unknown,
    parentNamespace?: string
  ): Node | null;
  syncComponentElement(
    currentDom: Node | null,
    node: DOMElement,
    type: ComponentFunction,
    props: Record<string, unknown>,
    parentNamespace?: string
  ): Node | null;
  updateElementFromVnode(
    el: Element,
    vnode: VNode,
    updateChildren?: boolean,
    forceChildrenUpdate?: boolean
  ): void;
};

let boundaryRangeHost: BoundaryRangeDOMHost | null = null;

export function configureBoundaryRangeHost(host: BoundaryRangeDOMHost): void {
  boundaryRangeHost = host;
}

export function getBoundaryRangeHost(): BoundaryRangeDOMHost {
  if (!boundaryRangeHost) {
    throw new Error('[askr] Control boundary DOM host is not configured.');
  }
  return boundaryRangeHost;
}

export function assignScopeRange(scope: ChildScope, range: DOMRange): void {
  scope.range = range;
  scope.dom = range.single ? range.start : undefined;
}

export function checkVNodeShapeChanged(dom: Node, vnode: VNode): boolean {
  if (!_isDOMElement(vnode) || !(dom instanceof Element)) return true;
  if (typeof vnode.type !== 'string') return true;
  return dom.tagName.toLowerCase() !== vnode.type.toLowerCase();
}

export function adoptHydratedRange(
  parent: Element,
  scope: ChildScope,
  before: Node | null,
  vnode: VNode
): DOMRange | null {
  if (!scope.hydrationPending || !before || !isRangeStart(before)) return null;
  const end = findRangeEnd(before);
  if (!end || end.parentNode !== parent) return null;
  const range: DOMRange = { start: before, end, single: false };
  const contentNodes = getRangeNodes(range);
  const expectedChildren =
    _isDOMElement(vnode) && isFragmentType(vnode.type)
      ? ((vnode.props?.children as VNode[] | undefined) ?? [])
      : [vnode];
  if (contentNodes.length !== expectedChildren.length) return null;
  for (let index = 0; index < expectedChildren.length; index += 1) {
    const expected = expectedChildren[index];
    const actual = contentNodes[index];
    if (
      _isDOMElement(expected) &&
      typeof expected.type === 'string' &&
      (!(actual instanceof Element) ||
        actual.tagName.toLowerCase() !== expected.type.toLowerCase())
    ) {
      return null;
    }
  }
  assignScopeRange(scope, range);
  scope.hydrationPending = false;
  return range;
}

export function getScopeRange(scope: ChildScope): DOMRange | null {
  if (scope.range) return scope.range;
  if (!scope.dom) return null;
  const range = { start: scope.dom, end: scope.dom, single: true } as DOMRange;
  scope.range = range;
  return range;
}

export function materializeChildScopeRange(
  vnode: VNode,
  parentNamespace?: string,
  scope?: ChildScope,
  scopeAlreadyActive = false
): DOMRange {
  const previousInstance =
    scope && !scopeAlreadyActive
      ? enterDomCommitScope(scope.componentInstance)
      : null;
  let dom: Node | null;
  try {
    const host = getBoundaryRangeHost();
    dom =
      scope?.blueprintOwner &&
      _isDOMElement(vnode) &&
      typeof vnode.type === 'string'
        ? host.createResultNodeWithBlueprint(
            scope.blueprintOwner,
            vnode,
            parentNamespace
          )
        : host.createDOMNode(vnode, parentNamespace);
  } finally {
    if (scope && !scopeAlreadyActive) restoreDomCommitScope(previousInstance);
  }
  if (!dom) return createEmptyRange(document, scope).range;
  if (!(dom instanceof DocumentFragment))
    return createSingleNodeRange(dom, scope);
  return createDetachedRange(dom, scope).range;
}

export function getBoundaryParentNamespace(
  parent: Element
): string | undefined {
  return getParentNamespace(parent);
}
