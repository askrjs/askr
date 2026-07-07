import type { ChildScope } from '../runtime';
import { syncControlBoundaryScopeDom } from './boundaries';
import { teardownNodeSubtree } from './cleanup';
import {
  createElementForNamespace,
  getParentNamespace,
  SVG_NAMESPACE,
} from './namespaces';
import {
  collectReactiveChildBoundaryVNodes,
  isSingleRootReactiveChildBoundaryValue,
} from './reactive-child-sources';
import type { VNode } from './types';

export interface ReactiveChildDOMHost {
  createDOMNode(node: unknown, parentNamespace?: string): Node | null;
  updateElementChildren(
    el: Element,
    children: VNode | VNode[] | undefined,
    forceUpdate?: boolean
  ): void;
}

export type ReactiveChildBoundarySequenceEntry =
  | { kind: 'static'; nodes: Node[] }
  | { kind: 'dynamic'; scope: ChildScope; nodes: Node[] };

export function materializeReactiveChildBoundaryNodes(
  value: unknown,
  parentNamespace: string | undefined,
  host: ReactiveChildDOMHost
): Node[] {
  const nodes: Node[] = [];
  const dom = host.createDOMNode(value, parentNamespace);
  if (!dom) {
    return nodes;
  }

  if (dom instanceof DocumentFragment) {
    for (let child = dom.firstChild; child; child = dom.firstChild) {
      nodes.push(child);
      dom.removeChild(child);
    }
    return nodes;
  }

  nodes.push(dom);
  return nodes;
}

export function createReactiveChildBoundaryHost(el: Element): Element {
  const ownerDocument = el.ownerDocument;
  const parentNamespace = getParentNamespace(el);
  return parentNamespace === SVG_NAMESPACE
    ? createElementForNamespace('g', parentNamespace, ownerDocument)
    : createElementForNamespace('div', parentNamespace, ownerDocument);
}

export function disposeReactiveChildBoundaryNodes(nodes: Node[]): void {
  for (const node of nodes) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }

    teardownNodeSubtree(node);
  }
}

export function syncReactiveChildExpectedNodes(
  el: Element,
  expectedNodes: Node[]
): void {
  const expectedNodeSet = new Set(expectedNodes);

  for (let node = el.firstChild; node; ) {
    const next = node.nextSibling;
    if (!expectedNodeSet.has(node)) {
      teardownNodeSubtree(node);
      el.removeChild(node);
    }
    node = next;
  }

  let anchor = el.firstChild;
  for (const node of expectedNodes) {
    if (node === anchor) {
      anchor = anchor.nextSibling;
      continue;
    }

    el.insertBefore(node, anchor);
    anchor = node.nextSibling;
  }
}

export function commitReactiveChildBoundaryEntryNodes(
  el: Element,
  entry: { scope: ChildScope; nodes: Node[] },
  host: ReactiveChildDOMHost
): Node[] {
  if (!entry.scope.needsDomUpdate) {
    return entry.nodes;
  }

  if (
    entry.scope.vnode === null ||
    entry.scope.vnode === undefined ||
    entry.scope.vnode === false
  ) {
    if (entry.nodes.length > 0) {
      disposeReactiveChildBoundaryNodes(entry.nodes);
      entry.nodes = [];
    }

    const dom = entry.scope.dom;
    if (dom?.parentNode === el) {
      teardownNodeSubtree(dom);
      el.removeChild(dom);
    }

    entry.scope.dom = undefined;
    entry.scope.needsDomUpdate = false;
    return entry.nodes;
  }

  if (!isSingleRootReactiveChildBoundaryValue(entry.scope.vnode)) {
    const nextChildren: VNode[] = [];
    collectReactiveChildBoundaryVNodes(entry.scope.vnode, nextChildren);

    const boundaryHost = createReactiveChildBoundaryHost(el);
    for (const node of entry.nodes) {
      boundaryHost.appendChild(node);
    }

    host.updateElementChildren(boundaryHost, nextChildren);

    const nextNodes = Array.from(boundaryHost.childNodes);

    entry.scope.dom = undefined;
    entry.scope.needsDomUpdate = false;
    entry.nodes = nextNodes;
    return nextNodes;
  }

  if (entry.nodes.length > 1) {
    disposeReactiveChildBoundaryNodes(entry.nodes);
    entry.nodes = [];
    entry.scope.dom = undefined;
  }

  const nextDom = syncControlBoundaryScopeDom(
    el,
    entry.scope,
    entry.scope.vnode ?? null
  );
  if (!nextDom) {
    entry.nodes = [];
    entry.scope.needsDomUpdate = false;
    return entry.nodes;
  }

  entry.nodes = [nextDom];
  entry.scope.needsDomUpdate = false;
  return entry.nodes;
}

export function syncReactiveChildSequenceNodes(
  el: Element,
  entries: ReactiveChildBoundarySequenceEntry[],
  host: ReactiveChildDOMHost
): void {
  const expectedNodes: Node[] = [];

  for (const entry of entries) {
    if (entry.kind === 'static') {
      expectedNodes.push(...entry.nodes);
      continue;
    }

    expectedNodes.push(
      ...commitReactiveChildBoundaryEntryNodes(el, entry, host)
    );
  }

  syncReactiveChildExpectedNodes(el, expectedNodes);
}

export function syncReactiveScalarTextNodes(
  el: Element,
  slotValues: unknown[],
  values: string[],
  host: ReactiveChildDOMHost
): void {
  const childNodes = el.childNodes;
  const canPatchInPlace = childNodes.length === values.length;

  if (canPatchInPlace) {
    let allText = true;
    for (let index = 0; index < childNodes.length; index += 1) {
      if (childNodes[index]?.nodeType !== Node.TEXT_NODE) {
        allText = false;
        break;
      }
    }

    if (allText) {
      for (let index = 0; index < values.length; index += 1) {
        const textNode = childNodes[index] as Text;
        if (textNode.data !== values[index]) {
          textNode.data = values[index];
        }
      }
      return;
    }
  }

  const boundaryHost = createReactiveChildBoundaryHost(el);
  for (let node = el.firstChild; node; ) {
    const next = node.nextSibling;
    boundaryHost.appendChild(node);
    node = next;
  }

  host.updateElementChildren(boundaryHost, slotValues as VNode[]);
  syncReactiveChildExpectedNodes(el, Array.from(boundaryHost.childNodes));
}
