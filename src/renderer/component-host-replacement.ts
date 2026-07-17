import {
  cleanupComponent,
  type ComponentInstance,
  registerLifecycleRollback,
  registerLifecycleTransaction,
} from '../runtime';
import { elementRefs, removeElementRef, updateElementRef } from './cleanup';
import { cleanupDetachedComponentHost } from './component-host-cleanup';
import type { InstanceHostNode } from './dom-host';
import { restoreVNodeComponentInstance } from './component-host-instances';

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
  const previousRef =
    existingHost instanceof Element ? elementRefs.get(existingHost) : undefined;
  let previousRefDetached = false;
  let nextDom: Node | null = null;
  let previousBindings = new Map<ComponentInstance, HostBinding>();
  let didReplace = false;
  let replacementAttempted = false;
  let finished = false;

  const commit = (): void => {
    if (finished) return;
    finished = true;
    if (replacementAttempted && didReplace) {
      const retained = Array.from(retainedInstances);
      if (nextDom) {
        for (const [instance, binding] of previousBindings) {
          if (
            binding.target !== existingHost &&
            binding.placeholder !== existingHost
          ) {
            continue;
          }
          if (nextDom instanceof Element) {
            instance.target = nextDom;
            instance._placeholder = undefined;
          } else if (nextDom instanceof Comment) {
            instance.target = null;
            instance._placeholder = nextDom;
          }
        }
      }
      cleanupDetachedComponentHost(existingHost, retained);
    }
  };

  const rollback = (): void => {
    if (finished) return;
    finished = true;
    if (!replacementAttempted) return;

    const rollbackErrors: unknown[] = [];
    const retained = Array.from(retainedInstances);
    if (nextDom && nextDom !== existingHost) {
      try {
        cleanupReplacementNode(nextDom, retained);
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    try {
      if (disposeOnRollback) cleanupComponent(retainedInstance);
      for (const [instance, binding] of previousBindings) {
        if (disposeOnRollback && instance === retainedInstance) continue;
        instance.target = binding.target;
        instance._placeholder = binding.placeholder;
      }
      if (!previousBindings.has(retainedInstance) && !disposeOnRollback) {
        retainedInstance.target = previousTarget;
      }
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

  const staged = registerLifecycleTransaction({}, commit, rollback);
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
      prepareNextDom(nextDom);
      if (parent && nextDom !== existingHost) {
        parent.replaceChild(nextDom, existingHost);
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

    if (!staged) commit();
    return nextDom;
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

  (provisionalInstance.cleanupFns ??= []).push(restoreOwnership);
  registerLifecycleRollback(() => {
    restoreOwnership();
    cleanupProvisionalComponentInstance(provisionalInstance);
  });
}
