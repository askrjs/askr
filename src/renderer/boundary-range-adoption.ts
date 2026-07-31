import { isFragmentType } from '../common/jsx';
import type { DOMRange } from '../common/dom-range';
import {
  enterDomCommitScope,
  restoreDomCommitScope,
  type ChildScope,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime';
import {
  createDetachedRange,
  createEmptyRange,
  createSingleNodeRange,
  findRangeEnd,
  getOwnedRange,
  getRangeNodes,
  isRangeStart,
} from './dom-range';
import { getVNodeComponentInstance } from './component-host-instances';
import { normalizeComponentChildren } from './child-shape';
import { getParentNamespace } from './namespaces';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import { isHydrationAdoptionScopeActive } from './intrinsic-hydration-adoption';

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
    parentNamespace?: string,
    forceChildrenUpdate?: boolean,
    retainedHostInstances?: Iterable<ComponentInstance>,
    hydrationRangeEnd?: Node | null,
    preserveHydrationCursorOnEmpty?: boolean
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

export function canAdoptHydratedElement(dom: Element, vnode: VNode): boolean {
  if (!_isDOMElement(vnode)) return false;
  if (typeof vnode.type === 'function') return true;
  return !checkVNodeShapeChanged(dom, vnode);
}

export function adoptHydratedRange(
  parent: Element,
  scope: ChildScope,
  before: Node | null,
  vnode: VNode
): DOMRange | null {
  if (
    !isHydrationAdoptionScopeActive() ||
    !scope.hydrationPending ||
    !before ||
    !isRangeStart(before)
  ) {
    return null;
  }
  const end = findRangeEnd(before);
  if (!end || end.parentNode !== parent) return null;
  const range: DOMRange = { start: before, end, single: false };
  const contentNodes = getRangeNodes(range);
  const expectedChildren = normalizeComponentChildren(
    Array.isArray(vnode)
      ? vnode
      : _isDOMElement(vnode) && isFragmentType(vnode.type)
        ? (vnode.props?.children ?? vnode.children ?? [])
        : [vnode]
  ) as VNode[];
  if (contentNodes.length !== expectedChildren.length) return null;
  for (let index = 0; index < expectedChildren.length; index += 1) {
    const expected = expectedChildren[index];
    const actual = contentNodes[index];
    if (typeof expected === 'string' || typeof expected === 'number') {
      if (actual?.nodeType !== Node.TEXT_NODE) return null;
      continue;
    }
    if (
      _isDOMElement(expected) &&
      typeof expected.type === 'string' &&
      (!(actual instanceof Element) ||
        actual.tagName.toLowerCase() !== expected.type.toLowerCase())
    ) {
      return null;
    }
  }

  const host = getBoundaryRangeHost();
  for (let index = 0; index < expectedChildren.length; index += 1) {
    const expected = expectedChildren[index];
    const actual = contentNodes[index]!;
    if (typeof expected === 'string' || typeof expected === 'number') {
      (actual as Text).data = String(expected);
      continue;
    }
    if (!_isDOMElement(expected)) continue;
    if (typeof expected.type === 'string') {
      host.updateElementFromVnode(actual as Element, expected, true);
      continue;
    }
    if (typeof expected.type === 'function') {
      const synced = host.syncComponentElement(
        actual,
        expected,
        expected.type as ComponentFunction,
        ((expected.props ?? {}) as Record<string, unknown>) || {},
        getBoundaryParentNamespace(parent)
      );
      if (!synced) return null;
    }
  }
  assignScopeRange(scope, range);
  scope.hydrationPending = false;
  return range;
}

export function getScopeRange(scope: ChildScope): DOMRange | null {
  const vnodeInstance = getVNodeComponentInstance(scope.vnode);
  const vnodeOwnedRange = vnodeInstance
    ? getOwnedRange(vnodeInstance)
    : undefined;
  if (vnodeOwnedRange) {
    assignScopeRange(scope, vnodeOwnedRange);
    return vnodeOwnedRange;
  }

  if (scope.range) {
    const host = scope.range.start as Node & {
      __ASKR_INSTANCE?: ComponentInstance;
    };
    const ownedRange = host.__ASKR_INSTANCE
      ? getOwnedRange(host.__ASKR_INSTANCE)
      : undefined;
    if (ownedRange?.start === scope.range.start) {
      assignScopeRange(scope, ownedRange);
    }
    return scope.range;
  }
  if (!scope.dom) return null;
  const range = { start: scope.dom, end: scope.dom, single: true } as DOMRange;
  scope.range = range;
  return range;
}

export function getAttachedScopeRange(
  parent: Element,
  scope: ChildScope
): DOMRange | null {
  const range = scope.range;
  if (range?.single) {
    if (range.start === scope.dom && range.start.parentNode === parent) {
      return range;
    }
  } else if (
    range &&
    range.start.parentNode === parent &&
    range.end.parentNode === parent
  ) {
    return range;
  }
  if (!range && scope.dom?.parentNode === parent) {
    return { start: scope.dom, end: scope.dom, single: true };
  }
  return getScopeRange(scope);
}

export function getRangeComponentFunction(
  range: DOMRange | null
): ComponentFunction | undefined {
  if (!range) return undefined;
  const host = range.start as Node & {
    __ASKR_INSTANCE?: ComponentInstance;
  };
  return host.__ASKR_INSTANCE?.fn;
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
  // Keep the transparent component's range owner so async rerenders can
  // recover its anchored host; this scope retains the range directly.
  return createDetachedRange(dom, scope, false, true).range;
}

export function getBoundaryParentNamespace(
  parent: Element
): string | undefined {
  return getParentNamespace(parent);
}
