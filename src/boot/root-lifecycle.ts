import { isDevelopmentEnvironment } from '../common/env';
import { logger } from '../common/logger';
import { disposeRegisteredDefaultPortalScope } from '../common/default-portal-runtime';
import {
  initializeNavigation,
  registerAppInstance,
  unregisterAppInstance,
} from '../router/navigate';
import { clearRouteState } from '../router/store';
import {
  cleanupComponent,
  createComponentInstance,
  flushRuntimeScheduler,
  executeComponent,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime';
import type { AppRenderRuntime } from '../common/app-render-runtime';
import {
  removeAllListeners,
  teardownNodeSubtree,
  activateHydrationBoundary as activateRendererHydrationBoundary,
  clearDeferredHydrationBoundaries,
} from '../renderer';
import type { BootAppRouteSource } from './types';
import { resolveRootElement } from './root-element';
import { validateCspNonce } from '../csp-nonce';
import { wrapRootRouteHandler } from './root-handler';
import { installRootUpdateHost } from './root-update';
import { installRendererBridge } from './runtime-wiring';
import { restartComponentGeneration } from '../runtime/component/generation';

installRendererBridge();
installRootUpdateHost();

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
  if (!Reflect.deleteProperty(rootElement, ROOT_CLEANUP_CALLBACKS_SYMBOL)) {
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
    if (
      callbacks.size === 0 &&
      elementWithCleanup[ROOT_CLEANUP_CALLBACKS_SYMBOL] === callbacks
    ) {
      clearRootCleanupCallbacks(rootElement);
    }
  };
}

function cleanupRootInstance(
  rootElement: Element,
  instance: ComponentInstance,
  options?: RootCleanupOptions
) {
  if (instancesByRoot.get(rootElement) !== instance) return;
  const element = rootElement as ElementWithCleanup;
  const cleanup = element[CLEANUP_SYMBOL];
  const callbacks = element[ROOT_CLEANUP_CALLBACKS_SYMBOL];
  const wasRoutedRoot = routedRoots.delete(rootElement);
  instancesByRoot.delete(rootElement);
  clearRootCleanupCallbacks(rootElement);
  // The instance check also makes non-configurable cleanup markers inert.
  Reflect.deleteProperty(element, CLEANUP_SYMBOL);
  clearDeferredHydrationBoundaries(rootElement);
  const errors: unknown[] = [];
  for (const phase of [
    [() => teardownNodeSubtree(rootElement), () => cleanupComponent(instance)],
    callbacks ?? [],
  ]) {
    for (const callback of phase) {
      try {
        callback();
      } catch (e) {
        errors.push(e);
      }
    }
  }

  if (options?.preserveInstance && !instancesByRoot.has(rootElement)) {
    instancesByRoot.set(rootElement, instance);
    element[CLEANUP_SYMBOL] = cleanup;
    if (wasRoutedRoot) routedRoots.add(rootElement);
  } else {
    unregisterAppInstance(instance);
  }
  if (wasRoutedRoot && routedRoots.size === 0) {
    clearRouteState();
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
  registerRootCleanupCallback(rootElement, () => {
    disposeRegisteredDefaultPortalScope(instance.portalScope ?? instance);
  });

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
        get: function (this: Element) {
          return descriptor.get?.call(this);
        },
        set: function (this: Element, value: string) {
          if (value === '' && instancesByRoot.get(this) === instance) {
            cleanupRootInstance(rootElement, instance);
          }
          return descriptor.set?.call(this, value);
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
  options?: {
    cleanupStrict?: boolean;
    appRuntime?: AppRenderRuntime;
    cspNonce?: string;
  }
) {
  const nonce = validateCspNonce(options?.cspNonce);
  const wrappedFn = wrapRootRouteHandler(componentFn, nonce);

  const existingCleanup = (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
  const reusedExistingInstance = typeof existingCleanup === 'function';
  if (reusedExistingInstance) {
    existingCleanup({ preserveInstance: true });
    if (
      (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL] !== existingCleanup
    ) {
      return;
    }
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

    restartComponentGeneration(instance, wrappedFn, !shouldResetHookState);
  } else {
    const componentId = String(++componentIdCounter);
    instance = createComponentInstance(
      componentId,
      wrappedFn,
      {},
      rootElement,
      null
    );
    instancesByRoot.set(rootElement, instance);
  }

  instance.isRoot = true;
  instance._rootComponentFn = componentFn;
  instance.portalScope = instance;
  instance._appRenderRuntime = options?.appRuntime;
  instance._cspNonce = nonce;
  if (options && typeof options.cleanupStrict === 'boolean') {
    instance.cleanupStrict = options.cleanupStrict;
  }

  attachCleanupForRoot(rootElement, instance);
  executeComponent(instance);
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
  previousInstance.target = null;
}

export async function registerAppNavigation(
  rootElement: Element,
  path: string,
  source: BootAppRouteSource
) {
  const instance = instancesByRoot.get(rootElement);
  if (!instance) throw new Error('Internal error: app instance missing');
  routedRoots.add(rootElement);
  registerAppInstance(instance, path, source);
  initializeNavigation();
}

/**
 * Tear down the app mounted at `root`: runs its cleanup callbacks, clears
 * route state if it was the last routed root, and removes bookkeeping for
 * the root element.
 */
export function cleanupApp(root: Element | string): void {
  const rootElement = resolveRootElement(root);

  if (!rootElement) return;

  const cleanupFn = (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
  if (typeof cleanupFn === 'function') {
    cleanupFn();
  } else {
    clearRootCleanupCallbacks(rootElement);
  }
}

/** Check whether an app instance is currently mounted at `root`. */
export function hasApp(root: Element | string): boolean {
  const rootElement = resolveRootElement(root);

  if (!rootElement) return false;
  return instancesByRoot.has(rootElement);
}
