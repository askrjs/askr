import { cleanupComponent } from '../runtime/component-contracts';
import type { ComponentInstance } from '../runtime/component-contracts';
import { removeElementListeners, removeElementReactiveProps } from './cleanup';
import type { InstanceHostElement } from './dom-host';

export function cleanupDetachedComponentHost(
  host: InstanceHostElement,
  retainedInstance: ComponentInstance
): void {
  removeElementListeners(host);
  removeElementReactiveProps(host);

  const hostInstances = host.__ASKR_INSTANCES;
  if (hostInstances && hostInstances.length > 0) {
    for (const instance of hostInstances) {
      if (instance === retainedInstance) continue;
      cleanupComponent(instance);
    }
  } else if (
    host.__ASKR_INSTANCE &&
    host.__ASKR_INSTANCE !== retainedInstance
  ) {
    cleanupComponent(host.__ASKR_INSTANCE);
  }

  const descendants = host.querySelectorAll('*');
  for (let index = 0; index < descendants.length; index += 1) {
    const descendant = descendants[index] as InstanceHostElement;
    removeElementListeners(descendant);
    removeElementReactiveProps(descendant);

    if (descendant.__ASKR_INSTANCES?.length) {
      for (const instance of descendant.__ASKR_INSTANCES) {
        if (instance === retainedInstance) continue;
        cleanupComponent(instance);
      }
      try {
        delete descendant.__ASKR_INSTANCES;
      } catch {
        // Ignore host cleanup failures.
      }
    } else if (
      descendant.__ASKR_INSTANCE &&
      descendant.__ASKR_INSTANCE !== retainedInstance
    ) {
      cleanupComponent(descendant.__ASKR_INSTANCE);
      try {
        delete descendant.__ASKR_INSTANCE;
      } catch {
        // Ignore host cleanup failures.
      }
    }
  }

  try {
    delete host.__ASKR_INSTANCE;
    delete host.__ASKR_INSTANCES;
    delete host.__ASKR_WRAPPER_HOST;
  } catch {
    // Ignore host cleanup failures.
  }
}

export function pruneComponentHostInstances(
  host: InstanceHostElement,
  retainedInstances: Iterable<ComponentInstance>
): void {
  const retained = new Set(retainedInstances);
  const nextInstances: ComponentInstance[] = [];
  const staleInstances = new Set<ComponentInstance>();

  const retainOrMarkStale = (instance: ComponentInstance | undefined) => {
    if (!instance) {
      return;
    }

    if (retained.has(instance)) {
      if (!nextInstances.includes(instance)) {
        nextInstances.push(instance);
      }
      return;
    }

    staleInstances.add(instance);
  };

  for (const instance of host.__ASKR_INSTANCES ?? []) {
    retainOrMarkStale(instance);
  }
  retainOrMarkStale(host.__ASKR_INSTANCE);

  for (const instance of staleInstances) {
    cleanupComponent(instance);
  }

  try {
    if (nextInstances.length > 0) {
      host.__ASKR_INSTANCES = nextInstances;
      host.__ASKR_INSTANCE = nextInstances[0];
    } else {
      delete host.__ASKR_INSTANCES;
      delete host.__ASKR_INSTANCE;
    }
  } catch {
    // Ignore host metadata cleanup failures.
  }
}
