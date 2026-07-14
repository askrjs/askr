import { isDevelopmentEnvironment } from '../common/env';
import { isPromiseLike } from '../common/promise';
import { logger } from '../common/logger';
import { DefaultPortal, disposeDefaultPortalScope } from '../runtime';
import { ELEMENT_TYPE, Fragment } from '../jsx';
import {
  initializeNavigation,
  registerAppInstance,
  unregisterAppInstance,
} from '../router/navigate';
import { clearRoutes } from '../router/route';
import {
  cleanupComponent,
  createComponentInstance,
  flushRuntimeScheduler,
  mountComponent,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime';
import {
  installRendererBridge,
  removeAllListeners,
  teardownNodeSubtree,
  activateHydrationBoundary as activateRendererHydrationBoundary,
  clearDeferredHydrationBoundaries,
} from '../renderer';
import type { BootAppRouteSource } from './types';
import { resolveRootElement } from './root-element';

installRendererBridge();

let componentIdCounter = 0;

const instancesByRoot = new WeakMap<Element, ComponentInstance>();
const routedRoots = new Set<Element>();

const CLEANUP_SYMBOL = Symbol.for('__askrCleanup__');
const ROOT_CLEANUP_CALLBACKS_SYMBOL = Symbol.for(
  '__askrRootCleanupCallbacks__'
);

type RootCleanupOptions = {
  preserveInstance?: boolean;
};

interface ElementWithCleanup extends Element {
  [CLEANUP_SYMBOL]?: (options?: RootCleanupOptions) => void;
  [ROOT_CLEANUP_CALLBACKS_SYMBOL]?: Set<() => void>;
}

function clearRootCleanupCallbacks(rootElement: Element): void {
  try {
    delete (rootElement as ElementWithCleanup)[ROOT_CLEANUP_CALLBACKS_SYMBOL];
  } catch {
    (rootElement as ElementWithCleanup)[ROOT_CLEANUP_CALLBACKS_SYMBOL]?.clear();
  }
}

export function registerRootCleanupCallback(
  rootElement: Element,
  callback: () => void
): () => void {
  const elementWithCleanup = rootElement as ElementWithCleanup;
  const callbacks =
    elementWithCleanup[ROOT_CLEANUP_CALLBACKS_SYMBOL] ?? new Set();
  callbacks.add(callback);
  elementWithCleanup[ROOT_CLEANUP_CALLBACKS_SYMBOL] = callbacks;

  return () => {
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      clearRootCleanupCallbacks(rootElement);
    }
  };
}

function runRootCleanupCallbacks(
  rootElement: Element,
  errors: unknown[]
): void {
  const callbacks = (rootElement as ElementWithCleanup)[
    ROOT_CLEANUP_CALLBACKS_SYMBOL
  ];
  if (!callbacks || callbacks.size === 0) {
    clearRootCleanupCallbacks(rootElement);
    return;
  }

  clearRootCleanupCallbacks(rootElement);
  for (const callback of callbacks) {
    try {
      callback();
    } catch (e) {
      errors.push(e);
    }
  }
}

function cleanupRootInstance(
  rootElement: Element,
  instance: ComponentInstance,
  options?: RootCleanupOptions
) {
  const errors: unknown[] = [];
  try {
    teardownNodeSubtree(rootElement);
  } catch (e) {
    errors.push(e);
  }

  try {
    cleanupComponent(instance);
  } catch (e) {
    errors.push(e);
  }

  runRootCleanupCallbacks(rootElement, errors);
  clearDeferredHydrationBoundaries(rootElement);

  if (!options?.preserveInstance) {
    unregisterAppInstance(instance);
    instancesByRoot.delete(rootElement);
    clearRootCleanupCallbacks(rootElement);
    try {
      delete (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
    } catch {
      // Ignore cleanup marker removal failures.
    }
  }

  if (errors.length > 0) {
    if (instance.cleanupStrict) {
      throw new AggregateError(errors, `cleanup failed for app root`);
    } else if (isDevelopmentEnvironment()) {
      for (const err of errors) logger.warn('[Askr] cleanup error:', err);
    }
  }
}

function attachCleanupForRoot(
  rootElement: Element,
  instance: ComponentInstance
) {
  (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL] = (options) => {
    cleanupRootInstance(rootElement, instance, options);
  };

  try {
    const descriptor =
      Object.getOwnPropertyDescriptor(rootElement, 'innerHTML') ||
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(rootElement),
        'innerHTML'
      ) ||
      Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');

    if (descriptor && (descriptor.get || descriptor.set)) {
      Object.defineProperty(rootElement, 'innerHTML', {
        get: descriptor.get
          ? function (this: Element) {
              return descriptor.get!.call(this);
            }
          : undefined,
        set: function (this: Element, value: string) {
          if (value === '' && instancesByRoot.get(this) === instance) {
            cleanupRootInstance(rootElement, instance);
          }
          if (descriptor.set) {
            return descriptor.set.call(this, value);
          }
        },
        configurable: true,
      });
    }
  } catch {
    // If Object.defineProperty fails, ignore
  }
}

export function mountOrUpdate(
  rootElement: Element,
  componentFn: ComponentFunction,
  options?: { cleanupStrict?: boolean }
) {
  const wrappedFn: ComponentFunction = (props, ctx) => {
    const out = componentFn(props, ctx);
    if (isPromiseLike(out)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }
    const portalVNode = {
      $$typeof: ELEMENT_TYPE,
      type: DefaultPortal,
      props: { __askrAutoDefaultPortal: true },
      key: '__default_portal',
    } as unknown;
    return {
      $$typeof: ELEMENT_TYPE,
      type: Fragment,
      props: {
        children:
          out === undefined || out === null
            ? [portalVNode]
            : [out, portalVNode],
      },
    } as unknown as ReturnType<ComponentFunction>;
  };
  Object.defineProperty(wrappedFn, 'name', {
    value: componentFn.name || 'Component',
  });

  const existingCleanup = (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
  const reusedExistingInstance = typeof existingCleanup === 'function';
  if (reusedExistingInstance) {
    existingCleanup({ preserveInstance: true });
  }

  let instance = instancesByRoot.get(rootElement);

  if (instance) {
    const shouldResetHookState = instance._rootComponentFn !== componentFn;

    if (!reusedExistingInstance) {
      removeAllListeners(rootElement);
      try {
        cleanupComponent(instance);
      } catch (e) {
        if (isDevelopmentEnvironment()) {
          logger.warn('[Askr] prior cleanup threw:', e);
        }
      }
    }

    instance.fn = wrappedFn;
    instance._rootComponentFn = componentFn;
    instance.evaluationGeneration++;
    instance.mounted = false;
    instance.expectedStateIndices = [];
    instance.firstRenderComplete = false;
    instance.isRoot = true;
    instance.portalScope = instance;

    if (shouldResetHookState) {
      instance.stateValues = [];
      instance.hasPendingUpdate = false;
      instance.notifyUpdate = null;
      instance.stateIndexCheck = -1;
      instance.mountOperations = [];
      instance.commitOperations = [];
      instance.lifecycleSlots = [];
      instance.cleanupFns = [];
      instance._currentRenderToken = undefined;
      instance.lastRenderToken = 0;
      instance._pendingReadSources = undefined;
      instance._lastReadSources = undefined;
      instance._placeholder = undefined;
      instance.errorBoundaryState = undefined;
      instance.devWarningsEmitted = undefined;
    }

    if (options && typeof options.cleanupStrict === 'boolean') {
      instance.cleanupStrict = options.cleanupStrict;
    }
  } else {
    const componentId = String(++componentIdCounter);
    instance = createComponentInstance(componentId, wrappedFn, {}, rootElement);
    instancesByRoot.set(rootElement, instance);
    instance.isRoot = true;
    instance._rootComponentFn = componentFn;
    instance.portalScope = instance;
    if (options && typeof options.cleanupStrict === 'boolean') {
      instance.cleanupStrict = options.cleanupStrict;
    }
  }

  attachCleanupForRoot(rootElement, instance);
  registerRootCleanupCallback(rootElement, () => {
    disposeDefaultPortalScope(instance.portalScope ?? instance);
  });
  mountComponent(instance);
  flushRuntimeScheduler();
}

/** @internal Activate one deferred boundary without rerunning its root. */
export function activateHydrationBoundary(
  rootElement: Element,
  boundary: Element
): boolean {
  if (!instancesByRoot.has(rootElement)) {
    return false;
  }

  const activated = activateRendererHydrationBoundary(boundary);
  if (activated) {
    flushRuntimeScheduler();
  }
  return activated;
}

/** @internal Move a prepared, off-tree root instance into a mounted root. */
export function replaceMountedRootInstance(
  rootElement: Element,
  previousInstance: ComponentInstance,
  nextInstance: ComponentInstance
): void {
  if (instancesByRoot.get(rootElement) !== previousInstance) {
    throw new Error('Mounted root changed while navigation was preparing');
  }

  instancesByRoot.set(rootElement, nextInstance);
  nextInstance.target = rootElement;
  nextInstance._placeholder = undefined;
  nextInstance.isRoot = true;
  attachCleanupForRoot(rootElement, nextInstance);
  registerRootCleanupCallback(rootElement, () => {
    disposeDefaultPortalScope(nextInstance.portalScope ?? nextInstance);
  });
  previousInstance.target = null;
}

export async function registerAppNavigation(
  rootElement: Element,
  path: string,
  source?: BootAppRouteSource
) {
  const instance = instancesByRoot.get(rootElement);
  if (!instance) throw new Error('Internal error: app instance missing');
  routedRoots.add(rootElement);
  registerAppInstance(instance, path, source);
  initializeNavigation();
}

export function cleanupApp(root: Element | string): void {
  const rootElement = resolveRootElement(root);

  if (!rootElement) return;

  const cleanupFn = (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
  try {
    if (typeof cleanupFn === 'function') {
      cleanupFn();
    }
  } finally {
    const wasRoutedRoot = routedRoots.delete(rootElement);
    instancesByRoot.delete(rootElement);
    clearRootCleanupCallbacks(rootElement);
    if (wasRoutedRoot && routedRoots.size === 0) {
      clearRoutes();
    }
    try {
      delete (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
    } catch {
      // Ignore cleanup marker removal failures.
    }
  }
}

export function hasApp(root: Element | string): boolean {
  const rootElement = resolveRootElement(root);

  if (!rootElement) return false;
  return instancesByRoot.has(rootElement);
}
