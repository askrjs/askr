import { isDevelopmentEnvironment } from '../common/env';
import { isPromiseLike } from '../common/promise';
import { logger } from '../common/logger';
import {
  disposeRegisteredDefaultPortalScope,
  getDefaultPortalHost,
} from '../common/default-portal-runtime';
import { ELEMENT_TYPE, Fragment } from '../jsx';
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
import { CspNonceScope, validateCspNonce } from '../csp-nonce';
import { installRendererBridge } from './runtime-wiring';
import { restartComponentGeneration } from '../runtime/component-generation';

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
  options?: {
    cleanupStrict?: boolean;
    appRuntime?: AppRenderRuntime;
    cspNonce?: string;
  }
) {
  const nonce = validateCspNonce(options?.cspNonce);
  const wrappedFn: ComponentFunction = (props, ctx) => {
    const out = componentFn(props, ctx);
    if (isPromiseLike(out)) {
      throw new Error(
        'Async components are not supported. Components must return synchronously.'
      );
    }
    const portalVNode = {
      $$typeof: ELEMENT_TYPE,
      type: getDefaultPortalHost(),
      props: { __askrAutoDefaultPortal: true },
      key: '__default_portal',
    } as unknown;
    const root = {
      $$typeof: ELEMENT_TYPE,
      type: Fragment,
      props: {
        children:
          out === undefined || out === null
            ? [portalVNode]
            : [out, portalVNode],
      },
    } as unknown as ReturnType<ComponentFunction>;
    return nonce === undefined
      ? root
      : CspNonceScope({ value: nonce, children: root });
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

    restartComponentGeneration(instance, wrappedFn, !shouldResetHookState);
    instance._rootComponentFn = componentFn;
    instance.isRoot = true;
    instance.portalScope = instance;
    instance._appRenderRuntime = options?.appRuntime;
    instance._cspNonce = nonce;

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
    instance._appRenderRuntime = options?.appRuntime;
    instance._cspNonce = nonce;
    if (options && typeof options.cleanupStrict === 'boolean') {
      instance.cleanupStrict = options.cleanupStrict;
    }
  }

  attachCleanupForRoot(rootElement, instance);
  registerRootCleanupCallback(rootElement, () => {
    disposeRegisteredDefaultPortalScope(instance.portalScope ?? instance);
  });
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
  registerRootCleanupCallback(rootElement, () => {
    disposeRegisteredDefaultPortalScope(
      nextInstance.portalScope ?? nextInstance
    );
  });
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
  try {
    if (typeof cleanupFn === 'function') {
      cleanupFn();
    }
  } finally {
    const wasRoutedRoot = routedRoots.delete(rootElement);
    instancesByRoot.delete(rootElement);
    clearRootCleanupCallbacks(rootElement);
    if (wasRoutedRoot && routedRoots.size === 0) {
      clearRouteState();
    }
    try {
      delete (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
    } catch {
      // Ignore cleanup marker removal failures.
    }
  }
}

/** Check whether an app instance is currently mounted at `root`. */
export function hasApp(root: Element | string): boolean {
  const rootElement = resolveRootElement(root);

  if (!rootElement) return false;
  return instancesByRoot.has(rootElement);
}
