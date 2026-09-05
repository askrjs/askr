import { isPromiseLike } from '../common/promise';
import type { Props } from '../common/props';
import {
  captureInlineRenderSnapshot,
  createComponentInstance,
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
  renderComponentInline,
  withContext,
  type ComponentFunction,
  type ComponentInstance,
  type ContextFrame,
} from '../runtime';
import { isFragmentVNode, normalizeComponentChildren } from './child-shape';
import { assertComponentChainDepth } from './component-chain-depth';
import {
  getVNodeComponentInstance,
  hasComponentOwnershipIdentity,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
  restoreVNodeComponentInstance,
  setComponentOwnershipIdentity,
  setVNodeComponentInstance,
} from './component-host-instances';
import {
  cleanupProvisionalComponentInstances,
  registerVNodeComponentInstanceRollback,
} from './component-host-replacement';
import { _isDOMElement, type DOMElement, type VNode } from './types';

function getFreshNestedComponentVNode(result: unknown): DOMElement | null {
  if (_isDOMElement(result) && typeof result.type === 'function') {
    return result;
  }
  if (!Array.isArray(result) && !isFragmentVNode(result)) {
    return null;
  }
  const children = normalizeComponentChildren(result);
  const child = children.length === 1 ? children[0] : undefined;
  return _isDOMElement(child) && typeof child.type === 'function'
    ? child
    : null;
}

export function prepareFreshNestedComponentResultDom(
  result: unknown,
  dom: Node
): Node {
  if (!Array.isArray(result) && !isFragmentVNode(result)) {
    return dom;
  }
  const fragment = document.createDocumentFragment();
  fragment.appendChild(dom);
  return fragment;
}

export interface FreshNestedComponentEntry {
  instance: ComponentInstance;
  result: VNode;
}

export interface FreshNestedComponentResolution {
  entries: FreshNestedComponentEntry[];
  createdInstances: ComponentInstance[];
  vnodeOwners: Array<{
    node: DOMElement;
    previous: ComponentInstance | undefined;
  }>;
}

export function rollbackFreshNestedComponentResolution(
  resolution: FreshNestedComponentResolution
): void {
  for (let index = resolution.vnodeOwners.length - 1; index >= 0; index -= 1) {
    const owner = resolution.vnodeOwners[index]!;
    restoreVNodeComponentInstance(owner.node, owner.previous);
  }
  cleanupProvisionalComponentInstances(resolution.createdInstances);
}

export function resolveFreshNestedComponentResult(
  result: unknown,
  snapshot: ContextFrame | null,
  parentInstance: ComponentInstance
): FreshNestedComponentResolution {
  let currentResult = result as VNode;
  let activeSnapshot = snapshot;
  let activeParent = parentInstance;
  let depth = 0;
  const resolution: FreshNestedComponentResolution = {
    entries: [],
    createdInstances: [],
    vnodeOwners: [],
  };

  try {
    let nestedVNode = getFreshNestedComponentVNode(currentResult);
    while (nestedVNode) {
      assertComponentChainDepth(depth, activeParent);
      const nestedSnapshot =
        getVNodeContextFrame(nestedVNode) ?? activeSnapshot;
      const componentFn = nestedVNode.type as ComponentFunction;
      const previous = getVNodeComponentInstance(nestedVNode);
      let nestedInstance =
        previous &&
        hasComponentOwnershipIdentity(
          previous,
          componentFn,
          nestedVNode,
          activeParent,
          0
        )
          ? previous
          : undefined;
      if (!nestedInstance) {
        nestedInstance = createComponentInstance(
          nextComponentInstanceId(),
          componentFn,
          (nestedVNode.props ?? {}) as Props,
          null
        );
        resolution.vnodeOwners.push({ node: nestedVNode, previous });
        registerVNodeComponentInstanceRollback(
          nestedVNode,
          previous,
          nestedInstance
        );
        setVNodeComponentInstance(nestedVNode, nestedInstance);
        resolution.createdInstances.push(nestedInstance);
      } else {
        captureInlineRenderSnapshot(nestedInstance);
      }

      setComponentOwnershipIdentity(
        nestedInstance,
        nestedVNode,
        activeParent,
        0
      );
      nestedInstance.isRoot = isRouteRootComponentVNode(nestedVNode);

      nestedInstance.portalScope =
        activeParent.portalScope ?? nestedInstance.portalScope;
      nestedInstance.cleanupStrict = activeParent.cleanupStrict;
      nestedInstance.props = ((nestedVNode.props ?? {}) as Props) || {};
      if (nestedSnapshot) nestedInstance.ownerFrame = nestedSnapshot;

      const nextResult = withContext(nestedSnapshot ?? null, () =>
        renderComponentInline(nestedInstance)
      );
      if (isPromiseLike(nextResult)) {
        throw new Error(
          'Async components are not supported. Components must return synchronously.'
        );
      }

      activeParent = nestedInstance;
      activeSnapshot = nestedSnapshot ?? null;
      currentResult = markVNodeTreeWithContextFrame(
        nextResult,
        activeSnapshot
      ) as VNode;
      resolution.entries.push({
        instance: nestedInstance,
        result: currentResult,
      });
      depth += 1;
      nestedVNode = getFreshNestedComponentVNode(currentResult);
    }

    return resolution;
  } catch (error) {
    rollbackFreshNestedComponentResolution(resolution);
    throw error;
  }
}
