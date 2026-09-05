import { registerCommitParticipant } from '../runtime/transaction-access';
import { ownCleanup } from '../runtime/ownership';
import { bindComponentHost } from './dom-ownership';
import {
  cleanupComponent,
  type ComponentInstance,
  registerCommitRollback,
} from '../runtime';
import { elementRefs, removeElementRef, updateElementRef } from './cleanup';
import { cleanupDetachedComponentHost } from './component-host-cleanup';
import type { InstanceHostNode } from './dom-host';
import { restoreVNodeComponentInstance } from './component-host-instances';
import {
  getOwnedRange,
  getRangeNodes,
  clearRangeOwner,
  createSingleNodeRange,
  registerRange,
  removeRange,
  type DOMRange,
} from './dom-range';

export interface ComponentHostReplacement {
  replace(
    materialize: () => Node,
    prepareNextDom: (nextDom: Node) => void
  ): Node;
}

export function cleanupProvisionalComponentInstance(
  instance: ComponentInstance
): void {
  try {
    cleanupComponent(instance);
  } catch {
    // A rollback cleanup error must not replace the creation failure.
  }
}

export function cleanupProvisionalComponentInstances(
  instances: ComponentInstance[]
): void {
  for (let index = instances.length - 1; index >= 0; index -= 1) {
    cleanupProvisionalComponentInstance(instances[index]!);
  }
}

export function createRetainedHostInstanceSet(
  owner: ComponentInstance,
  additional?: Iterable<ComponentInstance>
): Set<ComponentInstance> {
  const retained = new Set<ComponentInstance>([owner]);
  for (const instance of additional ?? []) retained.add(instance);
  return retained;
}

function cleanupReplacementNode(
  node: Node,
  retainedInstances: Iterable<ComponentInstance>
): void {
  cleanupDetachedComponentHost(node as InstanceHostNode, retainedInstances);
}

interface HostBinding {
  target: Element | null;
  placeholder: Comment | undefined;
}

export function beginComponentHostReplacement(
  existingHost: InstanceHostNode,
  retainedInstance: ComponentInstance,
  previousTarget: Element | null,
  retainedInstances: Iterable<ComponentInstance> = [retainedInstance],
  disposeOnRollback = false
): ComponentHostReplacement {
  const parent = existingHost.parentNode;
  const previousRange = getOwnedRange(retainedInstance);
  const previousNodes =
    previousRange && !previousRange.single
      ? [
          previousRange.start,
          ...getRangeNodes(previousRange),
          previousRange.end,
        ]
      : [existingHost];
  const previousNextSibling =
    previousNodes[previousNodes.length - 1]!.nextSibling;
  const previousRef =
    existingHost instanceof Element ? elementRefs.get(existingHost) : undefined;
  let previousRefDetached = false;
  let nextDom: Node | null = null;
  let nextHost: Node | null = null;
  let nextRange: DOMRange | undefined;
  let previousBindings = new Map<ComponentInstance, HostBinding>();
  let didReplace = false;
  let replacementAttempted = false;
  let finished = false;

  const publish = (): void => {
    if (finished) return;
    if (replacementAttempted && didReplace) {
      if (nextHost) {
        for (const [instance, binding] of previousBindings) {
          if (
            binding.target !== existingHost &&
            binding.placeholder !== existingHost
          ) {
            continue;
          }
          if (nextHost instanceof Element) {
            bindComponentHost(instance, nextHost);
          } else if (nextHost instanceof Comment) {
            bindComponentHost(instance, null, nextHost);
          }
        }
      }
    }
  };
  const settle = (): void => {
    if (finished) return;
    finished = true;
    if (!replacementAttempted || !didReplace) return;
    const retained = Array.from(retainedInstances);
    const errors: unknown[] = [];
    if (previousRange) clearRangeOwner(previousRange);
    for (const node of previousNodes) {
      try {
        cleanupDetachedComponentHost(node as InstanceHostNode, retained);
      } catch (error) {
        errors.push(error);
      }
    }
    if (nextRange) registerRange(nextRange, retainedInstance);
    if (errors.length)
      throw new AggregateError(
        errors,
        'Component replacement retirement failed'
      );
  };

  const rollback = (): void => {
    if (finished) return;
    finished = true;
    if (!replacementAttempted) return;

    const rollbackErrors: unknown[] = [];
    const retained = Array.from(retainedInstances);
    if (nextHost && nextHost !== existingHost) {
      try {
        if (nextRange && !nextRange.single) {
          removeRange(nextRange, (node) => {
            cleanupReplacementNode(node, retained);
            node.parentNode?.removeChild(node);
          });
        } else {
          cleanupReplacementNode(nextHost, retained);
          nextHost.parentNode?.removeChild(nextHost);
        }
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    if (parent) {
      try {
        for (const node of previousNodes)
          parent.insertBefore(
            node,
            previousNextSibling?.parentNode === parent
              ? previousNextSibling
              : null
          );
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    try {
      if (disposeOnRollback) cleanupComponent(retainedInstance);
      for (const [instance, binding] of previousBindings) {
        if (disposeOnRollback && instance === retainedInstance) continue;
        bindComponentHost(instance, binding.target, binding.placeholder);
      }
      if (!previousBindings.has(retainedInstance) && !disposeOnRollback) {
        bindComponentHost(
          retainedInstance,
          previousTarget,
          retainedInstance._placeholder
        );
      }
      if (previousRange) registerRange(previousRange, retainedInstance);
    } catch (error) {
      rollbackErrors.push(error);
    }
    if (previousRefDetached && previousRef && existingHost instanceof Element) {
      try {
        updateElementRef(existingHost, previousRef);
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        rollbackErrors,
        'Component host replacement rollback failed'
      );
    }
  };

  const apply = (): void => {
    if (
      replacementAttempted &&
      didReplace &&
      previousRange &&
      !previousRange.single
    ) {
      for (const node of previousNodes) node.parentNode?.removeChild(node);
    }
  };
  const staged = registerCommitParticipant({
    apply,
    publish,
    settle,
    rollback,
  });
  const replace = (
    materialize: () => Node,
    prepareNextDom: (replacement: Node) => void
  ): Node => {
    replacementAttempted = true;
    if (!staged && previousRef && existingHost instanceof Element) {
      removeElementRef(existingHost);
      previousRefDetached = true;
    }

    try {
      previousBindings = new Map(
        Array.from(retainedInstances, (instance) => [
          instance,
          {
            target: instance.target,
            placeholder: instance._placeholder,
          },
        ])
      );
      nextDom = materialize();
      const registeredRange = getOwnedRange(retainedInstance);
      nextRange =
        registeredRange && registeredRange !== previousRange
          ? registeredRange
          : undefined;
      nextHost =
        nextDom instanceof DocumentFragment ? nextDom.firstChild : nextDom;
      if (!nextHost) {
        throw new Error('[askr] Component replacement produced no host node.');
      }
      if (!nextRange) {
        nextRange = createSingleNodeRange(nextHost, retainedInstance);
      }
      prepareNextDom(nextHost);
      if (parent && nextHost !== existingHost) {
        if (previousRange && !previousRange.single) {
          parent.insertBefore(nextDom, previousRange.start);
        } else {
          parent.replaceChild(nextDom, existingHost);
        }
        didReplace = true;
      }
    } catch (error) {
      if (!staged) {
        try {
          rollback();
        } catch {
          // Preserve the original materialization error.
        }
      }
      throw error;
    }

    if (!staged) {
      apply();
      publish();
      settle();
    }
    return nextHost;
  };

  return { replace };
}

export function registerVNodeComponentInstanceRollback(
  node: unknown,
  previousInstance: ComponentInstance | undefined,
  provisionalInstance: ComponentInstance
): void {
  let restored = false;
  const restoreOwnership = (): void => {
    if (restored) return;
    restored = true;
    restoreVNodeComponentInstance(node, previousInstance);
  };

  ownCleanup(provisionalInstance.ownership, restoreOwnership);
  registerCommitRollback(() => {
    restoreOwnership();
    cleanupProvisionalComponentInstance(provisionalInstance);
  });
}
