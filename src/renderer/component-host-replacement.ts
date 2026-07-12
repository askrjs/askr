import {
  cleanupComponent,
  type ComponentInstance,
  registerLifecycleRollback,
  registerLifecycleTransaction,
} from '../runtime';
import { elementRefs, removeElementRef, updateElementRef } from './cleanup';
import {
  cleanupDetachedComponentHost,
} from './component-host-cleanup';
import type { InstanceHostElement } from './dom-host';
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
  retainedInstance: ComponentInstance
): void {
  if (node instanceof Element) {
    cleanupDetachedComponentHost(node as InstanceHostElement, retainedInstance);
    return;
  }

  try {
    delete (node as Node & { __ASKR_INSTANCE?: ComponentInstance })
      .__ASKR_INSTANCE;
  } catch {
    // Ignore metadata cleanup failures on DOM shims.
  }
}

export function beginComponentHostReplacement(
  existingHost: InstanceHostElement,
  retainedInstance: ComponentInstance,
  previousTarget: Element | null,
  retainedInstances: Iterable<ComponentInstance> = [retainedInstance],
  disposeOnRollback = false
): ComponentHostReplacement {
  const parent = existingHost.parentNode;
  const previousRef = elementRefs.get(existingHost);
  let previousRefDetached = false;
  let nextDom: Node | null = null;
  let didReplace = false;
  let replacementAttempted = false;
  let finished = false;

  const commit = (): void => {
    if (finished) return;
    finished = true;
    if (replacementAttempted && didReplace) {
      cleanupDetachedComponentHost(existingHost, retainedInstances);
    }
  };

  const rollback = (): void => {
    if (finished) return;
    finished = true;
    if (!replacementAttempted) return;

    const rollbackErrors: unknown[] = [];
    if (nextDom && nextDom !== existingHost) {
      try {
        cleanupReplacementNode(nextDom, retainedInstance);
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    try {
      if (disposeOnRollback) cleanupComponent(retainedInstance);
      else retainedInstance.target = previousTarget;
    } catch (error) {
      rollbackErrors.push(error);
    }
    if (previousRefDetached && previousRef) {
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
    if (!staged && previousRef) {
      removeElementRef(existingHost);
      previousRefDetached = true;
    }

    try {
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
