/**
 * App bootstrap and mount
 */

import {
  createComponentInstance,
  mountComponent,
  cleanupComponent,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime/component';
import {
  isDevelopmentEnvironment,
  isProductionEnvironment,
} from '../common/env';
import { logger } from '../dev/logger';
import { initializeNavigation, registerAppInstance } from '../router/navigate';
import {
  configureScrollRestoration,
  type ScrollRestorationOptions,
} from '../router/navigate';
import {
  _applyManifest,
  _drainLazy,
  _setActiveRouteAuthOptions,
  _snapshotLazy,
  clearRoutes,
  lockRouteRegistration,
  resolveRoute,
  resolveRouteRequest,
  route as registerRoute,
  setServerLocation,
} from '../router/route';
import { globalScheduler } from '../runtime/scheduler';
import { assertExecutionModel } from '../runtime/execution-model';
import { setStaticChildSlotsCacheEnabled } from '../renderer/dom';

const HAS_ROUTES_KEY = Symbol.for('__ASKR_HAS_ROUTES__');

let componentIdCounter = 0;

// Track instances by root element to support multiple createIsland calls on same root
const instancesByRoot = new WeakMap<Element, ComponentInstance>();

// Symbol for storing cleanup on elements
const CLEANUP_SYMBOL = Symbol.for('__askrCleanup__');
const ROOT_CLEANUP_CALLBACKS_SYMBOL = Symbol.for(
  '__askrRootCleanupCallbacks__'
);

type RootCleanupOptions = {
  preserveInstance?: boolean;
};

// Type for elements that have cleanup functions attached
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

function registerRootCleanupCallback(
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
  // Attempt to remove listeners and cleanup instances under the root.
  // In non-strict mode we preserve previous behavior by swallowing errors
  // (but logging in dev); in strict mode we aggregate and re-throw.
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

  if (!options?.preserveInstance) {
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

import { Fragment, ELEMENT_TYPE } from '../jsx';

import { DefaultPortal } from '../foundations/structures/portal';

function mountOrUpdate(
  rootElement: Element,
  componentFn: ComponentFunction,
  options?: { cleanupStrict?: boolean }
) {
  // Ensure root component always includes a DefaultPortal host by wrapping it.
  const wrappedFn: ComponentFunction = (props, ctx) => {
    const out = componentFn(props, ctx);
    const portalVNode = {
      $$typeof: ELEMENT_TYPE,
      type: DefaultPortal,
      props: {},
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
  // Preserve the original component name for debugging/dev warnings
  Object.defineProperty(wrappedFn, 'name', {
    value: componentFn.name || 'Component',
  });

  // Clean up existing cleanup function before mounting new one
  const existingCleanup = (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
  const reusedExistingInstance = typeof existingCleanup === 'function';
  if (reusedExistingInstance) {
    existingCleanup({ preserveInstance: true });
  }

  let instance = instancesByRoot.get(rootElement);

  if (instance) {
    const shouldResetHookState = instance.fn.name !== wrappedFn.name;

    if (!reusedExistingInstance) {
      removeAllListeners(rootElement);
      try {
        cleanupComponent(instance);
      } catch (e) {
        // If previous cleanup threw in strict mode, log but continue mounting new instance
        if (isDevelopmentEnvironment()) {
          logger.warn('[Askr] prior cleanup threw:', e);
        }
      }
    }

    instance.fn = wrappedFn;
    instance.evaluationGeneration++;
    instance.mounted = false;
    instance.expectedStateIndices = [];
    instance.firstRenderComplete = false;
    instance.isRoot = true;

    if (shouldResetHookState) {
      instance.stateValues = [];
      instance.hasPendingUpdate = false;
      instance.notifyUpdate = null;
      instance.stateIndexCheck = -1;
      instance.mountOperations = [];
      instance.cleanupFns = [];
      instance._currentRenderToken = undefined;
      instance.lastRenderToken = 0;
      instance._pendingReadSources = undefined;
      instance._lastReadSources = undefined;
      instance._placeholder = undefined;
      instance.errorBoundaryState = undefined;
      instance.devWarningsEmitted = undefined;
    }

    // Update strict flag if provided
    if (options && typeof options.cleanupStrict === 'boolean') {
      instance.cleanupStrict = options.cleanupStrict;
    }
  } else {
    const componentId = String(++componentIdCounter);
    instance = createComponentInstance(componentId, wrappedFn, {}, rootElement);
    instancesByRoot.set(rootElement, instance);
    instance.isRoot = true;
    // Initialize strict flag from options
    if (options && typeof options.cleanupStrict === 'boolean') {
      instance.cleanupStrict = options.cleanupStrict;
    }
  }

  attachCleanupForRoot(rootElement, instance);
  mountComponent(instance);
  globalScheduler.flush();
}

function bindResolvedRouteHandler(resolved: ResolvedRoute): ComponentFunction {
  return () =>
    resolved.handler(resolved.params) as ReturnType<ComponentFunction>;
}

function bindDeniedStatus(status: number): ComponentFunction {
  return () => ({
    type: 'div',
    props: {
      'data-route-denied': String(status),
    },
    children: [String(status)],
  });
}

// New strongly-typed init functions
import type {
  Route,
  RouteManifest,
  ResolvedRoute,
  RouteAuthOptions,
} from '../common/router';
import {
  installRendererBridge,
  removeAllListeners,
  teardownNodeSubtree,
} from '../renderer';
installRendererBridge();

export type IslandConfig = {
  root: Element | string;
  component: ComponentFunction;
  // Optional: surface cleanup errors during teardown for this island
  cleanupStrict?: boolean;
  // Explicitly disallow routes on islands at type level
  routes?: never;
};

export type IslandsConfig = {
  islands: IslandConfig[];
};

export type SPAConfig = {
  root: Element | string;
  /**
   * Preferred: pass the route manifest built via `registerRoutes(() => { ... })`.
   * ```ts
   * import { getManifest } from '@askrjs/askr/router';
   * await createSPA({ root: '#app', manifest: getManifest() });
   * ```
   */
  manifest?: RouteManifest;
  /** Legacy: flat route array — kept for backward compatibility and test fixtures. */
  routes?: Route[];
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  cleanupStrict?: boolean;
  component?: never;
};

export type HydrateSPAConfig = {
  root: Element | string;
  /** Preferred manifest input — see `SPAConfig.manifest`. */
  manifest?: RouteManifest;
  /** Legacy flat route array. */
  routes?: Route[];
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  cleanupStrict?: boolean;
  hydrate?: {
    verifyMarkup?: boolean;
    deferUntilIdle?: boolean;
    deferBelowFold?: boolean;
    foldThreshold?: number;
    skipSelectors?: string[];
  };
};

/**
 * createIsland: Enhances existing DOM (no router, mounts once)
 */
export function createIsland(config: IslandConfig): void {
  assertExecutionModel('islands');
  if (!config || typeof config !== 'object') {
    throw new Error('createIsland requires a config object');
  }
  if (typeof config.component !== 'function') {
    throw new Error('createIsland: component must be a function');
  }

  const rootElement =
    typeof config.root === 'string'
      ? document.getElementById(config.root)
      : config.root;
  if (!rootElement) throw new Error(`Root element not found: ${config.root}`);

  // Islands must not initialize router or routes
  if ('routes' in config) {
    throw new Error(
      'createIsland does not accept routes; use createSPA for routed apps'
    );
  }

  // Routes are never supported with islands.
  // If routes were registered (even at module load time), fail fast to avoid
  // surprising partial router behavior.
  try {
    const g = globalThis as unknown as Record<string | symbol, unknown>;
    if (g[HAS_ROUTES_KEY]) {
      throw new Error(
        'Routes are not supported with islands. Use createSPA (client) or createSSR (server) instead.'
      );
    }
  } catch {
    // ignore
  }

  mountOrUpdate(rootElement, config.component, {
    cleanupStrict: config.cleanupStrict,
  });
}

/**
 * createIslands: Enhances one or more existing DOM roots (no router).
 * The only public islands constructor.
 */
export function createIslands(config: IslandsConfig): void {
  assertExecutionModel('islands');
  if (!config || typeof config !== 'object') {
    throw new Error('createIslands requires a config object');
  }
  if (!Array.isArray(config.islands) || config.islands.length === 0) {
    throw new Error('createIslands requires a non-empty islands array');
  }
  for (const island of config.islands) {
    createIsland(island);
  }
}

/**
 * createSPA: Initializes router and mounts the app with the provided route manifest or route table.
 *
 * Preferred usage with manifest:
 * ```ts
 * import { getManifest } from '@askrjs/askr/router';
 * await createSPA({ root: '#app', manifest: getManifest() });
 * ```
 *
 * Legacy usage with plain routes array (still supported):
 * ```ts
 * await createSPA({ root: '#app', routes: getRoutes() });
 * ```
 */
export async function createSPA(config: SPAConfig): Promise<void> {
  assertExecutionModel('spa');
  if (!config || typeof config !== 'object') {
    throw new Error('createSPA requires a config object');
  }

  const hasManifest =
    config.manifest != null && config.manifest.records.length > 0;
  const hasRoutes = Array.isArray(config.routes) && config.routes.length > 0;

  if (!hasManifest && !hasRoutes) {
    throw new Error(
      'createSPA requires a route manifest or route table. ' +
        'Pass `manifest: getManifest()` or `routes: getRoutes()`. ' +
        'If you are enhancing existing HTML, use createIsland instead.'
    );
  }

  const rootElement =
    typeof config.root === 'string'
      ? document.getElementById(config.root)
      : config.root;
  if (!rootElement) throw new Error(`Root element not found: ${config.root}`);

  const pendingLazyAtBoot = _snapshotLazy();

  configureScrollRestoration(config.scrollRestoration);

  clearRoutes();

  if (hasManifest) {
    // Preferred path: apply pre-built manifest records directly
    _applyManifest(config.manifest!);
  } else {
    // Legacy path: register plain Route objects (no layout metadata)
    for (const r of config.routes!) {
      registerRoute(r.path, r.handler as Parameters<typeof registerRoute>[1]);
    }
  }

  const routeAuth = config.auth ?? config.manifest?.auth;
  _setActiveRouteAuthOptions(routeAuth);

  // Drain any lazy() imports so all split chunks are ready before mounting
  await _drainLazy(pendingLazyAtBoot);

  // Lock registration in production to prevent late registration surprises
  if (isProductionEnvironment()) lockRouteRegistration();

  // Mount the currently-resolved route handler (if any)
  let path = typeof window !== 'undefined' ? window.location.pathname : '/';
  let href =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : path;
  let resolved = await resolveRouteRequest(href, { auth: routeAuth });

  while (
    typeof window !== 'undefined' &&
    resolved &&
    resolved.kind === 'redirect'
  ) {
    const redirectTarget = new URL(resolved.to, window.location.href);
    const redirectHref = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;
    window.history.replaceState({ path: redirectHref }, '', redirectHref);
    path = redirectTarget.pathname;
    href = redirectHref;
    resolved = await resolveRouteRequest(href, { auth: routeAuth });
  }

  if (!resolved) {
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }), {
      cleanupStrict: config.cleanupStrict,
    });

    await registerAppNavigation(rootElement, path);
    return;
  }

  if (resolved.kind === 'redirect') {
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }), {
      cleanupStrict: config.cleanupStrict,
    });

    await registerAppNavigation(rootElement, path);
    return;
  }

  mountOrUpdate(
    rootElement,
    resolved.kind === 'deny'
      ? bindDeniedStatus(resolved.status)
      : bindResolvedRouteHandler({
          handler: resolved.handler,
          params: resolved.params,
        }),
    {
      cleanupStrict: config.cleanupStrict,
    }
  );

  await registerAppNavigation(rootElement, path);
}

/**
 * Mark elements that should be skipped during hydration
 */
function markSkippedElements(root: Element, skipSelectors: string[]): void {
  if (skipSelectors.length === 0) {
    return;
  }

  const uniqueSelectors = Array.from(new Set(skipSelectors));
  const selectorList = uniqueSelectors.join(', ');
  const elements = root.querySelectorAll(selectorList);
  elements.forEach((el) => el.setAttribute('data-skip-hydrate', 'true'));
}

function collectDeferredBelowFoldBoundaries(
  root: Element,
  foldY: number
): Element[] {
  const boundaries: Element[] = [];
  const stack: Element[] = [];

  for (let index = root.children.length - 1; index >= 0; index -= 1) {
    stack.push(root.children[index]);
  }

  while (stack.length > 0) {
    const element = stack.pop()!;

    if (element.hasAttribute('data-skip-hydrate')) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.top >= foldY) {
      element.setAttribute('data-skip-hydrate', 'true');
      boundaries.push(element);
      continue;
    }

    for (let index = element.children.length - 1; index >= 0; index -= 1) {
      stack.push(element.children[index]);
    }
  }

  return boundaries;
}

function activateVisibleDeferredBoundaries(
  boundaries: Element[],
  foldY: number
): { activated: boolean; remaining: number } {
  let activated = false;
  let remaining = 0;

  for (const element of boundaries) {
    if (!element.hasAttribute('data-skip-hydrate')) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.top < foldY) {
      element.removeAttribute('data-skip-hydrate');
      activated = true;
    } else {
      remaining += 1;
    }
  }

  return { activated, remaining };
}

function queueIdleWork(work: () => void): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(
        () => {
          work();
          resolve();
        },
        { timeout: 2000 }
      );
      return;
    }

    setTimeout(() => {
      work();
      resolve();
    }, 0);
  });
}

function flushHydrationActivation(rootElement: Element): void {
  const instance = instancesByRoot.get(rootElement);
  if (!instance) return;
  instance._enqueueRun?.();
  globalScheduler.flush();
}

function shouldVerifyHydrationMarkup(config: HydrateSPAConfig): boolean {
  const explicit = config.hydrate?.verifyMarkup;
  if (typeof explicit === 'boolean') {
    return explicit;
  }

  return !isProductionEnvironment();
}

async function registerAppNavigation(rootElement: Element, path: string) {
  const instance = instancesByRoot.get(rootElement);
  if (!instance) throw new Error('Internal error: app instance missing');
  registerAppInstance(instance as ComponentInstance, path);
  initializeNavigation();
}

/**
 * Apply selective hydration with deferral options
 */
async function applySelectiveHydration(
  rootElement: Element,
  resolved: { handler: ComponentFunction; params: Record<string, unknown> },
  path: string,
  cleanupStrict: boolean | undefined,
  hydrateOptions: NonNullable<HydrateSPAConfig['hydrate']>
): Promise<void> {
  const hasPermanentSkips = (hydrateOptions.skipSelectors?.length ?? 0) > 0;
  const hasBelowFoldDeferral = !!hydrateOptions.deferBelowFold;
  const hasSelectiveBoundaries = hasPermanentSkips || hasBelowFoldDeferral;
  let staticChildSlotsCacheSuspended = false;
  let releaseSelectiveHydrationResources = () => {};

  const restoreStaticChildSlotsCache = () => {
    if (!staticChildSlotsCacheSuspended) {
      return;
    }

    setStaticChildSlotsCacheEnabled(true);
    staticChildSlotsCacheSuspended = false;
  };

  if (hydrateOptions.skipSelectors?.length) {
    markSkippedElements(rootElement, hydrateOptions.skipSelectors);
  }

  let deferredBoundaries: Element[] = [];
  if (hydrateOptions.deferBelowFold) {
    setStaticChildSlotsCacheEnabled(false);
    staticChildSlotsCacheSuspended = true;
    const foldY = hydrateOptions.foldThreshold ?? window.innerHeight;
    deferredBoundaries = collectDeferredBelowFoldBoundaries(rootElement, foldY);

    let selectiveHydrationResourcesReleased = false;
    let unregisterRootCleanupCallback = () => {};

    function handleScroll() {
      const { activated, remaining } = activateVisibleDeferredBoundaries(
        deferredBoundaries,
        foldY
      );

      if (!activated) {
        return;
      }

      flushHydrationActivation(rootElement);

      if (remaining === 0) {
        releaseSelectiveHydrationResources();
      }
    }

    releaseSelectiveHydrationResources = () => {
      if (selectiveHydrationResourcesReleased) {
        return;
      }

      selectiveHydrationResourcesReleased = true;
      unregisterRootCleanupCallback();
      window.removeEventListener('scroll', handleScroll);
      restoreStaticChildSlotsCache();
    };

    unregisterRootCleanupCallback = registerRootCleanupCallback(
      rootElement,
      releaseSelectiveHydrationResources
    );

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  if (hydrateOptions.deferUntilIdle && !hasSelectiveBoundaries) {
    await queueIdleWork(() => {
      mountOrUpdate(
        rootElement,
        (() => resolved.handler(resolved.params)) as ComponentFunction,
        {
          cleanupStrict,
        }
      );
    });
    await registerAppNavigation(rootElement, path);
    return;
  }

  try {
    mountOrUpdate(
      rootElement,
      (() => resolved.handler(resolved.params)) as ComponentFunction,
      {
        cleanupStrict,
      }
    );
    await registerAppNavigation(rootElement, path);
  } catch (error) {
    releaseSelectiveHydrationResources();
    throw error;
  }

  if (hydrateOptions.deferUntilIdle && deferredBoundaries.length > 0) {
    await queueIdleWork(() => {
      try {
        const { activated } = activateVisibleDeferredBoundaries(
          deferredBoundaries,
          Number.POSITIVE_INFINITY
        );
        if (activated) {
          flushHydrationActivation(rootElement);
        }
      } finally {
        releaseSelectiveHydrationResources();
      }
    });
  }

  if (deferredBoundaries.length === 0) {
    releaseSelectiveHydrationResources();
  }
}

/**
 * hydrateSPA: Hydrate server-rendered HTML.
 * Accepts either a `manifest` (preferred) or a legacy `routes` array.
 */
export async function hydrateSPA(config: HydrateSPAConfig): Promise<void> {
  assertExecutionModel('spa');
  if (!config || typeof config !== 'object') {
    throw new Error('hydrateSPA requires a config object');
  }

  const hasManifest =
    config.manifest != null && config.manifest.records.length > 0;
  const hasRoutes = Array.isArray(config.routes) && config.routes.length > 0;

  if (!hasManifest && !hasRoutes) {
    throw new Error(
      'hydrateSPA requires a route manifest or route table. ' +
        'Pass `manifest: getManifest()` or `routes: getRoutes()`. ' +
        'If you are enhancing existing HTML, use createIsland instead.'
    );
  }

  const rootElement =
    typeof config.root === 'string'
      ? document.getElementById(config.root)
      : config.root;
  if (!rootElement) throw new Error(`Root element not found: ${config.root}`);

  const pendingLazyAtHydrationBoot = _snapshotLazy();

  configureScrollRestoration(config.scrollRestoration);

  clearRoutes();

  if (hasManifest) {
    _applyManifest(config.manifest!);
  } else {
    for (const r of config.routes!) {
      registerRoute(r.path, r.handler as Parameters<typeof registerRoute>[1]);
    }
  }

  _setActiveRouteAuthOptions(config.auth ?? config.manifest?.auth);

  // Drain any lazy() imports so all split chunks are ready before mounting
  await _drainLazy(pendingLazyAtHydrationBoot);

  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const currentUrl =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : path;
  setServerLocation(currentUrl);
  if (isProductionEnvironment()) lockRouteRegistration();

  const resolved = resolveRoute(path);
  if (!resolved) {
    throw new Error(`hydrateSPA: no route found for current path (${path}).`);
  }

  if (shouldVerifyHydrationMarkup(config)) {
    const legacyRouteTable = hasManifest
      ? config.manifest!.records.map((r) => ({
          path: r.path,
          handler: r.handler,
          namespace: r.options.namespace,
        }))
      : config.routes!;

    const { verifyHydrationSyncForUrl } =
      await import('../ssr/verify-hydration');
    if (
      !verifyHydrationSyncForUrl({
        root: rootElement,
        url: currentUrl,
        routes: legacyRouteTable,
      })
    ) {
      throw new Error(
        '[Askr] Hydration mismatch detected. Server HTML does not match expected server-render output.'
      );
    }
  }

  const hydrateOptions = config.hydrate;
  if (hydrateOptions) {
    if (hydrateOptions.deferUntilIdle || hydrateOptions.deferBelowFold) {
      await applySelectiveHydration(
        rootElement,
        {
          handler: resolved.handler as ComponentFunction,
          params: resolved.params as Record<string, unknown>,
        },
        path,
        config.cleanupStrict,
        hydrateOptions
      );
      return;
    }

    if (hydrateOptions.skipSelectors?.length) {
      markSkippedElements(rootElement, hydrateOptions.skipSelectors);
    }
  }

  mountOrUpdate(rootElement, bindResolvedRouteHandler(resolved), {
    cleanupStrict: config.cleanupStrict,
  });
  await registerAppNavigation(rootElement, path);
}

/**
 * Cleanup an app mounted on a root element (element or id).
 * Safe to call multiple times — no-op when nothing is mounted.
 */
export function cleanupApp(root: Element | string): void {
  const rootElement =
    typeof root === 'string' ? document.getElementById(root) : root;

  if (!rootElement) return;

  const cleanupFn = (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
  try {
    if (typeof cleanupFn === 'function') {
      cleanupFn();
    }
  } finally {
    instancesByRoot.delete(rootElement);
    clearRootCleanupCallbacks(rootElement);
    try {
      delete (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
    } catch {
      // Ignore cleanup marker removal failures.
    }
  }
}

/**
 * Check whether an app is mounted on the given root
 */
export function hasApp(root: Element | string): boolean {
  const rootElement =
    typeof root === 'string' ? document.getElementById(root) : root;

  if (!rootElement) return false;
  return instancesByRoot.has(rootElement);
}
