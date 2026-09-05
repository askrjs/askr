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
import {
  materializeComponentResultNode,
  materializeResolvedComponentResultNode,
} from './component-host-results';
import {
  prepareFreshNestedComponentResultDom,
  resolveFreshNestedComponentResult,
  rollbackFreshNestedComponentResolution,
  type FreshNestedComponentResolution,
} from './component-host-fresh-chain';
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
  let nestedResolution: FreshNestedComponentResolution | null = null;
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

    nestedResolution = resolveFreshNestedComponentResult(
      scopedResult,
      snapshot ?? null,
      childInstance
    );

    const deepestEntry =
      nestedResolution.entries[nestedResolution.entries.length - 1];

    let dom = snapshot
      ? withContext(snapshot, () =>
          materializeComponentResultNode(
            deepestEntry?.instance ?? childInstance,
            deepestEntry?.result ?? scopedResult,
            parentNamespace
          )
        )
      : materializeComponentResultNode(
          deepestEntry?.instance ?? childInstance,
          deepestEntry?.result ?? scopedResult,
          parentNamespace
        );

    if (deepestEntry) {
      for (
        let index = nestedResolution.entries.length - 2;
        index >= 0;
        index -= 1
      ) {
        const entry = nestedResolution.entries[index]!;
        dom = materializeResolvedComponentResultNode(
          entry.instance,
          entry.result,
          prepareFreshNestedComponentResultDom(entry.result, dom)
        );
      }
      dom = materializeResolvedComponentResultNode(
        childInstance,
        scopedResult,
        prepareFreshNestedComponentResultDom(scopedResult, dom)
      );
    }

    if (dom instanceof Element) {
      materializeFreshKey(dom, node, props);
    }
    return dom;
  } catch (error) {
    if (nestedResolution) {
      rollbackFreshNestedComponentResolution(nestedResolution);
    }
    if (!hadChildInstance) {
      restoreVNodeComponentInstance(node, previousVNodeInstance);
      cleanupProvisionalComponentInstance(childInstance);
    }
    throw error;
  }
}
