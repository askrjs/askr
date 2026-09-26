import {
  getCurrentCommitTransaction,
  runCommitOperation,
} from '../../runtime/transactions/access';
import {
  enterDomCommitScope,
  getVNodeContextFrame,
  endComponentScope,
  type ComponentFunction,
  type ComponentInstance,
} from '../../runtime';
import { hasTransparentComponentResult } from '../../common/control';
import { isTransparentComponentResult } from '../children/child-shape';
import { syncComponentFragmentRange } from './fragment-range';
import {
  materializeComponentResultNode,
  retainMaterializedReplacementOwnerChain,
  retainReplacementOwnerChain,
} from './host-results';
import { resolveHostNestedComponentResult } from './host-nested-results';
import {
  beginComponentHostReplacement,
  createRetainedHostInstanceSet,
} from './host-replacement';
import {
  findRangeAtNode,
  getOwnedRange,
  isRangeStart,
} from '../ownership/ranges';
import {
  getRendererDOMHost,
  type ElementWithContext,
  type InstanceHostElement,
  type InstanceHostNode,
} from '../dom-host';
import { getParentNamespace } from '../intrinsic/namespaces';
import { getRetainedHostOwnerChain } from '../evaluation/reconcile';
import { _isDOMElement } from '../types';
import { getDefaultPortalHost } from '../../common/default-portal-runtime';

export function replaceComponentRange(
  instance: ComponentInstance,
  result: unknown,
  host: Element | Comment
): Node | null {
  if (getCurrentCommitTransaction())
    return replaceComponentRangeInTransaction(instance, result, host);
  return runCommitOperation(() =>
    replaceComponentRangeInTransaction(instance, result, host)
  );
}
function replaceComponentRangeInTransaction(
  instance: ComponentInstance,
  result: unknown,
  host: Element | Comment
): Node | null {
  if (instance._rootComponentFn) {
    return null;
  }
  const instanceHost = host as InstanceHostNode;
  const hostInstances = new Set(instanceHost.__ASKR_INSTANCES ?? []);
  if (instanceHost.__ASKR_INSTANCE) {
    hostInstances.add(instanceHost.__ASKR_INSTANCE);
  }
  const sharedRange =
    instance._placeholder === host && hostInstances.has(instance)
      ? (findRangeAtNode(host) ?? undefined)
      : undefined;
  const previousRange =
    getOwnedRange(instance) ??
    sharedRange ??
    (instance.target === host ||
    (instance._placeholder === host && !isRangeStart(host))
      ? { start: host, end: host, single: true }
      : undefined);
  const parent = host.parentNode;
  if (
    !previousRange ||
    previousRange.start !== host ||
    !(parent instanceof Element)
  ) {
    return null;
  }
  // Descendants that share this host (components rendering no DOM of their
  // own) normally stay: the new result reuses them. An ErrorBoundary is
  // different: it materializes its children or fallback afresh on every
  // self re-render, so descendants of the swapped-out content must be
  // cleaned up with the old host instead of surviving it.
  const retainedInstances = createRetainedHostInstanceSet(
    instance,
    instance.errorBoundaryState
      ? getRetainedHostOwnerChain(instanceHost as InstanceHostElement, instance)
      : instanceHost.__ASKR_INSTANCES
  );
  if (previousRange.single) {
    const emptyResult =
      result === null || result === undefined || result === false;
    if (host instanceof Comment && emptyResult) {
      return host;
    }
    if (
      !(host instanceof Comment) &&
      !emptyResult &&
      !isTransparentComponentResult(result)
    ) {
      return null;
    }

    if (
      _isDOMElement(result) &&
      typeof result.type === 'function' &&
      (host instanceof Comment || hasTransparentComponentResult(result.type))
    ) {
      const syncedHost = getRendererDOMHost().syncComponentElement(
        host,
        result as ElementWithContext,
        result.type as ComponentFunction,
        (result.props ?? {}) as Record<string, unknown>,
        getParentNamespace(parent),
        false,
        retainedInstances
      );
      if (syncedHost) {
        retainReplacementOwnerChain(syncedHost, instance, retainedInstances);
        return syncedHost;
      }
    }

    const replacement = beginComponentHostReplacement(
      instanceHost,
      instance,
      instance.target,
      retainedInstances
    );
    return replacement.replace(
      () =>
        materializeComponentResultNode(
          instance,
          result,
          getParentNamespace(parent)
        ),
      (nextHost) =>
        retainMaterializedReplacementOwnerChain(
          nextHost,
          instance,
          retainedInstances
        )
    );
  }

  const placeholder = host as Comment;
  if (syncComponentFragmentRange(placeholder, instance, result, false)) {
    return placeholder;
  }
  if (
    instance.fn === getDefaultPortalHost() &&
    syncComponentFragmentRange(placeholder, instance, [result], false)
  ) {
    return placeholder;
  }

  if (_isDOMElement(result) && typeof result.type === 'function') {
    const resolvedResult = resolveHostNestedComponentResult(
      placeholder,
      instance,
      result,
      getVNodeContextFrame(result) ?? instance.ownerFrame ?? null,
      retainedInstances
    );
    const previousInstance = enterDomCommitScope(resolvedResult.owner);
    try {
      if (
        syncComponentFragmentRange(
          placeholder,
          instance,
          resolvedResult.result,
          false
        )
      ) {
        return placeholder;
      }
    } finally {
      endComponentScope(previousInstance);
    }
  }

  const replacement = beginComponentHostReplacement(
    instanceHost,
    instance,
    instance.target,
    retainedInstances
  );
  return replacement.replace(
    () =>
      materializeComponentResultNode(
        instance,
        result,
        getParentNamespace(parent)
      ),
    (nextHost) =>
      retainMaterializedReplacementOwnerChain(
        nextHost,
        instance,
        retainedInstances
      )
  );
}
