import { isPromiseLike } from '../../common/promise';
import {
  prepareRetainedComponentUpdate,
  enterDomCommitScope,
  getCurrentInstance,
  renderComponentInline,
  restoreDomCommitScope,
  type ComponentFunction,
  type ComponentInstance,
} from '../../runtime';
import {
  getCurrentContextFrame,
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
  withContext,
} from '../../runtime';
import { materializeKey } from '../props/attributes';
import { normalizeComponentChildren } from '../children/child-shape';
import { syncComponentFragmentRange } from './fragment-range';
import { pruneComponentHostInstances } from './host-cleanup';
import {
  getRendererDOMHost,
  type ElementWithContext,
  type InstanceHostElement,
  type InstanceHostNode,
} from '../dom-host';
import {
  inheritComponentKey,
  isRouteRootComponentVNode,
  extractComponentIdentityKey,
} from './host-instances';
import { _isDOMElement, type DOMElement, type VNode } from '../types';
import { tagNamesEqualIgnoreCase } from '../utils';
import {
  beginComponentHostReplacement,
  createRetainedHostInstanceSet,
} from './host-replacement';
import {
  materializeComponentResultNode,
  retainMaterializedReplacementOwnerChain,
  retainReplacementOwnerChain,
} from './host-results';
import {
  resolveHostNestedComponentResult,
  resolveWrapperHostResult,
} from './host-nested-results';
export function updateRetainedComponentHost(
  existingHost: InstanceHostNode,
  existingInstance: ComponentInstance,
  node: ElementWithContext,
  type: ComponentFunction,
  props: Record<string, unknown>,
  parentNamespace: string | undefined,
  forceChildrenUpdate: boolean,
  retainedHostInstances: Iterable<ComponentInstance> | undefined
): Node | null {
  const domHost = getRendererDOMHost();

  const snapshot =
    getVNodeContextFrame(node) ||
    getCurrentContextFrame() ||
    existingInstance.ownerFrame ||
    null;
  const liveRetainedInstances = createRetainedHostInstanceSet(
    existingInstance,
    retainedHostInstances
  );
  const replacement = beginComponentHostReplacement(
    existingHost,
    existingInstance,
    existingInstance.target,
    liveRetainedInstances
  );
  prepareRetainedComponentUpdate(
    existingInstance,
    props || {},
    node,
    () => extractComponentIdentityKey(node),
    getCurrentInstance(),
    () => isRouteRootComponentVNode(node),
    snapshot
  );

  const result = withContext(snapshot, () =>
    renderComponentInline(existingInstance)
  );
  if (isPromiseLike(result)) {
    throw new Error(
      'Async components are not supported. Components must return synchronously.'
    );
  }
  const scopedResult = markVNodeTreeWithContextFrame(result, snapshot ?? null);

  if (
    existingHost instanceof Element &&
    (existingHost as InstanceHostElement).__ASKR_WRAPPER_HOST
  ) {
    const wrapperResult = resolveWrapperHostResult(
      existingHost,
      existingInstance,
      scopedResult,
      snapshot ?? null,
      liveRetainedInstances
    );
    const previousInstance = enterDomCommitScope(wrapperResult.owner);
    try {
      domHost.updateElementChildren(
        existingHost,
        normalizeComponentChildren(wrapperResult.result) as VNode[]
      );
    } finally {
      restoreDomCommitScope(previousInstance);
    }
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    return existingHost;
  }

  if (
    existingHost instanceof Comment &&
    syncComponentFragmentRange(
      existingHost,
      existingInstance,
      scopedResult,
      forceChildrenUpdate || existingInstance.owner.mounted === false
    )
  ) {
    retainReplacementOwnerChain(
      existingHost,
      existingInstance,
      liveRetainedInstances
    );
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    return existingHost;
  }

  if (
    existingHost instanceof Element &&
    scopedResult &&
    typeof scopedResult === 'object' &&
    'type' in (scopedResult as DOMElement) &&
    typeof (scopedResult as DOMElement).type === 'string' &&
    tagNamesEqualIgnoreCase(
      existingHost.tagName,
      (scopedResult as DOMElement).type as string
    )
  ) {
    withContext(snapshot, () => {
      domHost.updateElementFromVnode(
        existingHost,
        inheritComponentKey(scopedResult as DOMElement, node),
        true,
        forceChildrenUpdate || existingInstance.owner.mounted === false
      );
      materializeKey(existingHost, node, props);
    });
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    return existingHost;
  }

  const resolvedResult = resolveHostNestedComponentResult(
    existingHost,
    existingInstance,
    scopedResult,
    snapshot ?? null,
    liveRetainedInstances
  );
  let didSyncResolvedRange = false;
  if (existingHost instanceof Comment) {
    const previousInstance = enterDomCommitScope(resolvedResult.owner);
    try {
      didSyncResolvedRange = syncComponentFragmentRange(
        existingHost,
        existingInstance,
        resolvedResult.result,
        forceChildrenUpdate || existingInstance.owner.mounted === false
      );
    } finally {
      restoreDomCommitScope(previousInstance);
    }
  }
  if (didSyncResolvedRange) {
    retainReplacementOwnerChain(
      existingHost,
      existingInstance,
      liveRetainedInstances
    );
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    return existingHost;
  }
  if (
    existingHost instanceof Comment &&
    (resolvedResult.result === null ||
      resolvedResult.result === undefined ||
      resolvedResult.result === false)
  ) {
    retainReplacementOwnerChain(
      existingHost,
      existingInstance,
      liveRetainedInstances
    );
    for (const instance of liveRetainedInstances) {
      if (instance.target === null || instance._placeholder === existingHost) {
        instance.target = null;
        instance._placeholder = existingHost;
      }
    }
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    return existingHost;
  }
  if (
    existingHost instanceof Element &&
    _isDOMElement(resolvedResult.result) &&
    typeof resolvedResult.result.type === 'string' &&
    tagNamesEqualIgnoreCase(existingHost.tagName, resolvedResult.result.type)
  ) {
    withContext(snapshot, () => {
      domHost.updateElementFromVnode(
        existingHost,
        inheritComponentKey(resolvedResult.result as DOMElement, node),
        true,
        forceChildrenUpdate || existingInstance.owner.mounted === false
      );
      materializeKey(existingHost, node, props);
    });
    pruneComponentHostInstances(existingHost, liveRetainedInstances);
    return existingHost;
  }

  const nextDom = replacement.replace(
    () =>
      materializeComponentResultNode(
        existingInstance,
        scopedResult,
        parentNamespace
      ),
    (replacement) => {
      if (replacement instanceof Element) {
        materializeKey(replacement, node, props);
      }
      retainMaterializedReplacementOwnerChain(
        replacement,
        existingInstance,
        liveRetainedInstances
      );
    }
  );

  return nextDom;
}
