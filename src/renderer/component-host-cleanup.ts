import {
  cleanupComponent,
  clearDelegatedHandlersForElement,
  incDevCounter,
  registerLifecycleTransaction,
  removeDelegatedListener,
} from '../runtime';
import type { ComponentInstance } from '../runtime';
import {
  elementListeners,
  elementReactivePropsCleanup,
  forEachDescendantNode,
  forEachElementReactivePropCleanup,
  removeElementRef,
  replaceElementRefBookkeeping,
  type ReactivePropCleanupEntry,
} from './cleanup';
import type { InstanceHostElement } from './dom-host';

type InstanceHostNode = Node & {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
  __ASKR_WRAPPER_HOST?: boolean;
};

export function cleanupDetachedComponentHost(
  host: InstanceHostElement,
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
  for (const property of [
    '__ASKR_INSTANCE',
    '__ASKR_INSTANCES',
    '__ASKR_WRAPPER_HOST',
  ] as const) {
    try {
      delete node[property];
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
}

export function pruneComponentHostInstances(
  host: InstanceHostElement,
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

  const commit = (): void => {
    // Keep the iterable live until commit. Nested component resolution can
    // register pruning before render, then add every successfully retained
    // owner before the lifecycle batch is finalized.
    const retained = new Set(retainedInstances);
    const currentInstances = collectHostInstances(host);
    const nextInstances = Array.from(currentInstances).filter((instance) =>
      retained.has(instance)
    );

    for (const instance of retained) {
      if (instance.target === host && !nextInstances.includes(instance)) {
        nextInstances.push(instance);
      }
    }

    writeHostInstances(host, nextInstances);
    cleanupHostInstances(
      Array.from(currentInstances).filter(
        (instance) => !retained.has(instance)
      ),
      'Component host pruning failed'
    );
  };

  const rollback = (): void => {
    const currentInstances = collectHostInstances(host);

    try {
      if (hadInstanceList) {
        host.__ASKR_INSTANCES = previousInstanceList;
      } else {
        delete host.__ASKR_INSTANCES;
      }

      if (hadPrimaryInstance) {
        host.__ASKR_INSTANCE = previousPrimaryInstance;
      } else {
        delete host.__ASKR_INSTANCE;
      }
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

  if (!registerLifecycleTransaction({}, commit, rollback)) {
    commit();
  }
}

function collectHostInstances(
  host: InstanceHostElement
): Set<ComponentInstance> {
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
  host: InstanceHostElement,
  instances: ComponentInstance[]
): void {
  try {
    if (instances.length > 0) {
      host.__ASKR_INSTANCES = instances;
      host.__ASKR_INSTANCE = instances[0];
    } else {
      delete host.__ASKR_INSTANCES;
      delete host.__ASKR_INSTANCE;
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
