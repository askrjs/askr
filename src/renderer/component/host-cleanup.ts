import { clearHostOwners, writeHostOwners } from '../ownership/nodes';
import {
  cleanupComponent,
  getCurrentInstance,
  incDevCounter,
} from '../../runtime';
import { registerCommitParticipant } from '../../runtime/transactions/access';
import {
  clearDelegatedHandlersForElement,
  removeDelegatedListener,
} from '../props/events';
import type { ComponentInstance } from '../../runtime';
import {
  elementListeners,
  elementReactivePropsCleanup,
  forEachDescendantNode,
  forEachElementReactivePropCleanup,
  removeElementRef,
  replaceElementRefBookkeeping,
  type ReactivePropCleanupEntry,
} from '../ownership/cleanup';
import type { InstanceHostNode } from '../dom-host';

export function retireComponentOwnersForIntrinsicReuse(
  element: Element,
  retainedOwner?: ComponentInstance | null
): void {
  const host = element as InstanceHostNode;
  if (host.__ASKR_INSTANCE || host.__ASKR_INSTANCES?.length) {
    const instances = host.__ASKR_INSTANCES ?? [];
    // A transparent component may reconcile its own intrinsic result through
    // a slot-level path. Preserve that active owner and its outer wrappers;
    // owners before it belong to the departed nested component branch.
    const activeOwner =
      retainedOwner === undefined ? getCurrentInstance() : retainedOwner;
    const activeOwnerIndex = activeOwner ? instances.indexOf(activeOwner) : -1;
    const retainedInstances =
      activeOwnerIndex >= 0
        ? instances.slice(activeOwnerIndex)
        : activeOwner && host.__ASKR_INSTANCE === activeOwner
          ? [activeOwner]
          : [];
    pruneComponentHostInstances(host, retainedInstances);
  }
}

export function cleanupDetachedComponentHost(
  host: InstanceHostNode,
  retainedInstance: ComponentInstance | Iterable<ComponentInstance>
): void {
  const retainedInstances =
    retainedInstance instanceof Object &&
    typeof (retainedInstance as Iterable<ComponentInstance>)[
      Symbol.iterator
    ] === 'function'
      ? new Set(retainedInstance as Iterable<ComponentInstance>)
      : new Set([retainedInstance as ComponentInstance]);
  const cleanupErrors: unknown[] = [];
  const cleanedInstances = new Set<ComponentInstance>();
  const nodes: InstanceHostNode[] = [host];

  try {
    forEachDescendantNode(host, (node) => {
      nodes.push(node as InstanceHostNode);
    });
  } catch (error) {
    cleanupErrors.push(error);
  }

  for (const node of nodes) {
    if (node instanceof Element) {
      cleanupElementListeners(node, cleanupErrors);
      cleanupElementReactiveProps(node, cleanupErrors);
      cleanupElementRef(node, cleanupErrors);
    }
    cleanupNodeInstances(
      node,
      retainedInstances,
      cleanedInstances,
      cleanupErrors
    );
    clearHostMetadata(node, cleanupErrors);
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      'Detached component host cleanup failed'
    );
  }
}

function cleanupElementListeners(
  element: Element,
  cleanupErrors: unknown[]
): void {
  const listenerMap = elementListeners.get(element);
  if (listenerMap) {
    // Clear ownership before invoking DOM hooks so a throwing shim cannot make
    // a later teardown attempt execute the same listener cleanup twice.
    elementListeners.delete(element);
    for (const entry of listenerMap.values()) {
      try {
        incDevCounter('listenerRemoves');
        if (entry.isDelegated) {
          removeDelegatedListener(element, entry.eventName);
        } else if (entry.options !== undefined) {
          element.removeEventListener(
            entry.eventName,
            entry.handler,
            entry.options
          );
        } else {
          element.removeEventListener(entry.eventName, entry.handler);
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  try {
    clearDelegatedHandlersForElement(element);
  } catch (error) {
    cleanupErrors.push(error);
  }
}

function cleanupElementReactiveProps(
  element: Element,
  cleanupErrors: unknown[]
): void {
  if (!elementReactivePropsCleanup.has(element)) {
    return;
  }

  const entries: ReactivePropCleanupEntry[] = [];
  forEachElementReactivePropCleanup(element, (entry) => entries.push(entry));
  // Delete first for the same exactly-once guarantee as listener cleanup.
  elementReactivePropsCleanup.delete(element);
  for (const entry of entries) {
    try {
      entry.cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
}

function cleanupElementRef(element: Element, cleanupErrors: unknown[]): void {
  try {
    removeElementRef(element);
  } catch (error) {
    // removeElementRef invokes user code before deleting its bookkeeping.
    // Clear the entry after a failed callback without invoking it a second time.
    replaceElementRefBookkeeping(element, undefined);
    cleanupErrors.push(error);
  }
}

function cleanupNodeInstances(
  node: InstanceHostNode,
  retainedInstances: Set<ComponentInstance>,
  cleanedInstances: Set<ComponentInstance>,
  cleanupErrors: unknown[]
): void {
  const instances = new Set<ComponentInstance>(node.__ASKR_INSTANCES ?? []);
  if (node.__ASKR_INSTANCE) {
    instances.add(node.__ASKR_INSTANCE);
  }

  for (const instance of instances) {
    if (retainedInstances.has(instance) || cleanedInstances.has(instance)) {
      continue;
    }

    cleanedInstances.add(instance);
    try {
      cleanupComponent(instance);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
}

function clearHostMetadata(
  node: InstanceHostNode,
  cleanupErrors: unknown[]
): void {
  clearHostOwners(node, (error) => cleanupErrors.push(error));
  try {
    delete node.__ASKR_WRAPPER_HOST;
  } catch (error) {
    cleanupErrors.push(error);
  }
}

export function pruneComponentHostInstances(
  host: InstanceHostNode,
  retainedInstances: Iterable<ComponentInstance>
): void {
  const hadInstanceList = Object.prototype.hasOwnProperty.call(
    host,
    '__ASKR_INSTANCES'
  );
  const hadPrimaryInstance = Object.prototype.hasOwnProperty.call(
    host,
    '__ASKR_INSTANCE'
  );
  const previousInstanceList = host.__ASKR_INSTANCES?.slice();
  const previousPrimaryInstance = host.__ASKR_INSTANCE;
  const previousInstances = collectHostInstances(host);

  let departedInstances: ComponentInstance[] = [];
  const publish = (): void => {
    // Keep the desired iterable live until commit. Nested resolution adds only
    // wrappers that completed successfully; old host metadata remains a
    // lookup ledger and never contributes owners to the next generation.
    const nextInstances = orderHostInstances(retainedInstances);
    const retained = new Set(nextInstances);
    writeHostInstances(host, nextInstances);
    departedInstances = Array.from(previousInstances).filter(
      (instance) => !retained.has(instance)
    );
  };
  const settle = (): void =>
    cleanupHostInstances(departedInstances, 'Component host pruning failed');

  const rollback = (): void => {
    const currentInstances = collectHostInstances(host);
    for (const instance of retainedInstances) {
      currentInstances.add(instance);
    }

    try {
      writeHostOwners(
        host,
        previousInstanceList,
        previousPrimaryInstance,
        hadInstanceList,
        hadPrimaryInstance
      );
    } catch {
      // Host metadata restoration is best-effort on readonly DOM shims.
    }

    cleanupHostInstances(
      Array.from(currentInstances).filter(
        (instance) => !previousInstances.has(instance)
      ),
      'Provisional component host cleanup failed'
    );
  };

  if (!registerCommitParticipant({ publish, settle, rollback })) {
    publish();
    settle();
  }
}

function orderHostInstances(
  instances: Iterable<ComponentInstance>
): ComponentInstance[] {
  const ordered = Array.from(new Set(instances));
  const candidates = new Set(ordered);
  const originalIndex = new Map(
    ordered.map((instance, index) => [instance, index] as const)
  );
  const depthCache = new Map<ComponentInstance, number>();

  const getDepth = (
    instance: ComponentInstance,
    visiting = new Set<ComponentInstance>()
  ): number => {
    const cached = depthCache.get(instance);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(instance)) {
      return 0;
    }

    visiting.add(instance);
    const parent = instance._vnodeParent ?? instance.parentInstance;
    const depth =
      parent && candidates.has(parent) ? getDepth(parent, visiting) + 1 : 0;
    visiting.delete(instance);
    depthCache.set(instance, depth);
    return depth;
  };

  return ordered.sort(
    (left, right) =>
      getDepth(right) - getDepth(left) ||
      originalIndex.get(left)! - originalIndex.get(right)!
  );
}

function collectHostInstances(host: InstanceHostNode): Set<ComponentInstance> {
  const instances = new Set<ComponentInstance>();
  for (const instance of host.__ASKR_INSTANCES ?? []) {
    instances.add(instance);
  }
  if (host.__ASKR_INSTANCE) {
    instances.add(host.__ASKR_INSTANCE);
  }
  return instances;
}

function writeHostInstances(
  host: InstanceHostNode,
  instances: ComponentInstance[]
): void {
  try {
    if (instances.length > 0) {
      writeHostOwners(host, instances, instances[0]);
    } else {
      writeHostOwners(host, undefined, undefined);
    }
  } catch {
    // Ignore host metadata cleanup failures.
  }
}

function cleanupHostInstances(
  instances: Iterable<ComponentInstance>,
  message: string
): void {
  const cleanupErrors: unknown[] = [];
  for (const instance of instances) {
    try {
      cleanupComponent(instance);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, message);
  }
}
