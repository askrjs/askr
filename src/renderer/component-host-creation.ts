import { isPromiseLike } from '../common/promise';
import type { Props } from '../common/props';
import {
  captureInlineRenderSnapshot,
  createComponentInstance,
  getCurrentInstance,
  renderComponentInline,
  type ComponentFunction,
} from '../runtime';
import {
  getCurrentContextFrame,
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
  withContext,
} from '../runtime';
import { materializeFreshKey } from './attributes';
import {
  getVNodeComponentInstance,
  hasComponentOwnershipIdentity,
  inheritComponentCleanupStrict,
  isRouteRootComponentVNode,
  nextComponentInstanceId,
  restoreVNodeComponentInstance,
  setComponentOwnershipIdentity,
  setVNodeComponentInstance,
} from './component-host-instances';
import {
  cleanupProvisionalComponentInstance,
  registerVNodeComponentInstanceRollback,
} from './component-host-replacement';
import { materializeComponentResultNode } from './component-host-results';
import type { ElementWithContext } from './dom-host';
import type { JSXComponent } from './types';

export function createComponentElement(
  node: ElementWithContext,
  type: JSXComponent,
  props: Record<string, unknown>,
  parentNamespace?: string
): Node {
  const frame = getVNodeContextFrame(node);
  const snapshot = frame || getCurrentContextFrame();

  const componentFn = type as unknown as (props: Props) => unknown;
  const isAsync = componentFn.constructor.name === 'AsyncFunction';

  if (isAsync) {
    throw new Error(
      'Async components are not supported. Use resource() for async work.'
    );
  }

  const previousVNodeInstance = getVNodeComponentInstance(node);
  const currentParent = getCurrentInstance();
  let childInstance =
    previousVNodeInstance &&
    hasComponentOwnershipIdentity(
      previousVNodeInstance,
      componentFn as ComponentFunction,
      node,
      currentParent,
      0
    )
      ? previousVNodeInstance
      : undefined;
  const hadChildInstance = !!childInstance;
  if (!childInstance) {
    childInstance = createComponentInstance(
      nextComponentInstanceId(),
      componentFn as ComponentFunction,
      props || {},
      null
    );
    registerVNodeComponentInstanceRollback(
      node,
      previousVNodeInstance,
      childInstance
    );
    setVNodeComponentInstance(node, childInstance);
  }

  try {
    if (hadChildInstance) {
      captureInlineRenderSnapshot(childInstance);
    }

    childInstance.portalScope =
      getCurrentInstance()?.portalScope ?? childInstance.portalScope;
    setComponentOwnershipIdentity(childInstance, node, getCurrentInstance(), 0);
    childInstance.parentInstance = getCurrentInstance();
    childInstance.props = props || {};
    childInstance.isRoot = isRouteRootComponentVNode(node);
    inheritComponentCleanupStrict(childInstance);

    if (snapshot) {
      childInstance.ownerFrame = snapshot;
    }

    const result = snapshot
      ? withContext(snapshot, () => renderComponentInline(childInstance))
      : renderComponentInline(childInstance);

    if (isPromiseLike(result)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }

    const scopedResult = markVNodeTreeWithContextFrame(
      result,
      snapshot ?? null
    );

    const dom = snapshot
      ? withContext(snapshot, () =>
          materializeComponentResultNode(
            childInstance,
            scopedResult,
            parentNamespace
          )
        )
      : materializeComponentResultNode(
          childInstance,
          scopedResult,
          parentNamespace
        );

    if (dom instanceof Element) {
      materializeFreshKey(dom, node, props);
    }
    return dom;
  } catch (error) {
    if (!hadChildInstance) {
      restoreVNodeComponentInstance(node, previousVNodeInstance);
      cleanupProvisionalComponentInstance(childInstance);
    }
    throw error;
  }
}
