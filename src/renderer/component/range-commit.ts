import { runCommitOperation } from '../../runtime/transactions/access';
import {
  enterDomCommitScope,
  getVNodeContextFrame,
  restoreDomCommitScope,
  type ComponentFunction,
  type ComponentInstance,
} from '../../runtime';
import { hasTransparentComponentResult } from '../../common/control';
import { pruneComponentHostInstances } from './host-cleanup';
import {
  isTransparentComponentResult,
  normalizeComponentChildren,
} from '../children/child-shape';
import { syncComponentFragmentRange } from './fragment-range';
import {
  materializeComponentResultNode,
  retainMaterializedReplacementOwnerChain,
  retainReplacementOwnerChain,
} from './host-results';
import {
  resolveHostNestedComponentResult,
  resolveWrapperHostResult,
} from './host-nested-results';
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
import { _isDOMElement, type VNode } from '../types';

export function replaceComponentRange(
  instance: ComponentInstance,
  result: unknown,
  host: Element | Comment
): Node | null {
  return runCommitOperation(() =>
    replaceComponentRangeInTransaction(instance, result, host)
  );
}
function replaceComponentRangeInTransaction(
  instance: ComponentInstance,
  result: unknown,
  host: Element | Comment
): Node | null {
  if (
    instance._rootComponentFn ||
    (
      instance.props as {
        __askrAutoDefaultPortal?: boolean;
      }
    ).__askrAutoDefaultPortal === true
  ) {
    return null;
  }
  if (
    host instanceof Element &&
    (host as InstanceHostElement).__ASKR_WRAPPER_HOST
  ) {
    const retainedInstances = createRetainedHostInstanceSet(
      instance,
      (host as InstanceHostNode).__ASKR_INSTANCES
    );
    const snapshot =
      getVNodeContextFrame(result) ?? instance.ownerFrame ?? null;
    const wrapperResult = resolveWrapperHostResult(
      host,
      instance,
      result,
      snapshot,
      retainedInstances
    );
    const previousInstance = enterDomCommitScope(wrapperResult.owner);
    try {
      getRendererDOMHost().updateElementChildren(
        host,
        normalizeComponentChildren(wrapperResult.result) as VNode[]
      );
    } finally {
      restoreDomCommitScope(previousInstance);
    }
    retainReplacementOwnerChain(host, instance, retainedInstances);
    pruneComponentHostInstances(host, retainedInstances);
    return host;
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
  const retainedInstances = createRetainedHostInstanceSet(
    instance,
    instanceHost.__ASKR_INSTANCES
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
      host instanceof Element &&
      _isDOMElement(result) &&
      hasTransparentComponentResult(result.type)
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

  if (_isDOMElement(result) && hasTransparentComponentResult(result.type)) {
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
      restoreDomCommitScope(previousInstance);
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
