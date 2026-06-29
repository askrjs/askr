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
import {
  initializeNavigation,
  registerAppInstance,
  unregisterAppInstance,
} from '../router/navigate';
import {
  configureScrollRestoration,
  type ScrollRestorationOptions,
} from '../router/navigate';
import {
  _applyManifest,
  _drainLazy,
  _setActiveRouteAuthOptions,
  _snapshotRouteSourceLazy,
  _snapshotLazy,
  clearRoutes,
  hasRegisteredRoutes,
  lockRouteRegistration,
  resolveRouteRequest,
  route as registerRoute,
  setServerLocation,
} from '../router/route';
import { globalScheduler } from '../runtime/scheduler';
import { assertExecutionModel } from '../runtime/execution-model';
import { setStaticChildSlotsCacheEnabled } from '../renderer/dom';
import { isPromiseLike } from '../common/promise';
import { SSR_RENDER_DATA_ATTR, type SSRData } from '../common/ssr';
import {
  startHydrationRenderPhase,
  stopHydrationRenderPhase,
} from '../common/render-context';

let componentIdCounter = 0;

// Track instances by root element to support multiple createIsland calls on same root
const instancesByRoot = new WeakMap<Element, ComponentInstance>();
const routedRoots = new Set<Element>();

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

function takeHydrationRenderData(rootElement: Element): SSRData | null {
  for (const child of Array.from(rootElement.children)) {
    if (
      child instanceof HTMLScriptElement &&
      child.getAttribute(SSR_RENDER_DATA_ATTR) === 'true'
    ) {
      const raw = child.textContent ?? '';
      child.remove();
      if (!raw) {
        return {};
      }

      try {
        return JSON.parse(raw) as SSRData;
      } catch (err) {
        throw new Error(
          '[Askr] Failed to parse embedded SSR render data during hydration.',
          { cause: err }
        );
      }
    }
  }

  return null;
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

import { Fragment, ELEMENT_TYPE } from '../jsx';

import { DefaultPortal } from '../foundations/structures/portal';
import { disposeDefaultPortalScope } from '../foundations/structures/portal';

function mountOrUpdate(
  rootElement: Element,
  componentFn: ComponentFunction,
  options?: { cleanupStrict?: boolean }
) {
  // Ensure root component always includes a DefaultPortal host by wrapping it.
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

    // Update strict flag if provided
    if (options && typeof options.cleanupStrict === 'boolean') {
      instance.cleanupStrict = options.cleanupStrict;
    }
  } else {
    const componentId = String(++componentIdCounter);
    instance = createComponentInstance(componentId, wrappedFn, {}, rootElement);
    instancesByRoot.set(rootElement, instance);
    instance.isRoot = true;
    instance.portalScope = instance;
    // Initialize strict flag from options
    if (options && typeof options.cleanupStrict === 'boolean') {
      instance.cleanupStrict = options.cleanupStrict;
    }
  }

  attachCleanupForRoot(rootElement, instance);
  registerRootCleanupCallback(rootElement, () => {
    disposeDefaultPortalScope(instance.portalScope ?? instance);
  });
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
  RouteRegistry,
  ResolvedRoute,
  RouteAuthOptions,
  RouteRequestResult,
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

type BootRouteSource =
  | {
      registry: RouteRegistry;
      manifest?: RouteManifest;
      routes?: Route[];
    }
  | {
      manifest: RouteManifest;
      registry?: RouteRegistry;
      routes?: Route[];
    }
  | {
      manifest?: RouteManifest;
      registry?: RouteRegistry;
      routes: Route[];
    };

export type SPAConfig = BootRouteSource & {
  root: Element | string;
  /**
   * Preferred: pass the route manifest built via `registerRoutes(() => { ... })`.
   * ```ts
   * import { getManifest } from '@askrjs/askr/router';
   * await createSPA({ root: '#app', manifest: getManifest() });
   * ```
   */
  auth?: RouteAuthOptions;
  scrollRestoration?: boolean | ScrollRestorationOptions;
  cleanupStrict?: boolean;
  component?: never;
};

export type HydrateSPAConfig = BootRouteSource & {
  root: Element | string;
  /** Preferred manifest input — see `SPAConfig.manifest`. */
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

const MAX_INITIAL_ROUTE_REDIRECTS = 20;

async function resolveInitialRoute(
  auth?: RouteAuthOptions
): Promise<{ path: string; href: string; resolved: RouteRequestResult }> {
  let path = typeof window !== 'undefined' ? window.location.pathname : '/';
  let href =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : path;
  const visited = new Set<string>();

  for (
    let redirects = 0;
    redirects <= MAX_INITIAL_ROUTE_REDIRECTS;
    redirects++
  ) {
    if (visited.has(href)) {
      throw new Error(`[Askr] Route redirect cycle detected at ${href}.`);
    }
    visited.add(href);

    const resolved = await resolveRouteRequest(href, { auth });
    if (
      typeof window === 'undefined' ||
      !resolved ||
      resolved.kind !== 'redirect'
    ) {
      return { path, href, resolved };
    }

    const redirectTarget = new URL(resolved.to, window.location.href);
    const redirectHref = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;
    window.history.replaceState({ path: redirectHref }, '', redirectHref);
    path = redirectTarget.pathname;
    href = redirectHref;
  }

  throw new Error(
    `[Askr] Route redirect limit exceeded (${MAX_INITIAL_ROUTE_REDIRECTS}).`
  );
}

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
  if (hasRegisteredRoutes()) {
    throw new Error(
      'Routes are not supported with islands. Use createSPA (client) or createSSR (server) instead.'
    );
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

  const manifest = config.manifest ?? config.registry?.manifest;
  const routeTable = config.routes ?? config.registry?.routes;
  const hasManifest = manifest != null && manifest.records.length > 0;
  const hasRoutes = Array.isArray(routeTable) && routeTable.length > 0;

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

  const pendingLazyAtBoot = [
    ..._snapshotLazy(),
    ..._snapshotRouteSourceLazy({ registry: config.registry, manifest }),
  ];

  configureScrollRestoration(config.scrollRestoration);

  clearRoutes();

  if (hasManifest) {
    // Preferred path: apply pre-built manifest records directly
    _applyManifest(manifest!);
  } else {
    // Legacy path: register plain Route objects (no layout metadata)
    for (const r of routeTable!) {
      registerRoute(r.path, r.handler as Parameters<typeof registerRoute>[1]);
    }
  }

  const routeAuth = config.auth ?? manifest?.auth;
  const activeManifest = hasManifest ? manifest : undefined;
  const appRouteSource = {
    manifest: activeManifest,
    routes: hasManifest ? undefined : routeTable,
    auth: routeAuth,
  };
  _setActiveRouteAuthOptions(routeAuth);

  // Drain any lazy() imports so all split chunks are ready before mounting
  await _drainLazy(pendingLazyAtBoot);

  // Lock registration in production to prevent late registration surprises
  if (isProductionEnvironment()) lockRouteRegistration();

  // Mount the currently-resolved route handler (if any)
  const { path, resolved } = await resolveInitialRoute(routeAuth);

  if (!resolved) {
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }), {
      cleanupStrict: config.cleanupStrict,
    });

    await registerAppNavigation(rootElement, path, {
      ...appRouteSource,
    });
    return;
  }

  if (resolved.kind === 'redirect') {
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }), {
      cleanupStrict: config.cleanupStrict,
    });

    await registerAppNavigation(rootElement, path, {
      ...appRouteSource,
    });
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

  await registerAppNavigation(rootElement, path, {
    ...appRouteSource,
  });
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

async function registerAppNavigation(
  rootElement: Element,
  path: string,
  source?: {
    manifest?: RouteManifest;
    routes?: readonly Route[];
    auth?: RouteAuthOptions;
  }
) {
  const instance = instancesByRoot.get(rootElement);
  if (!instance) throw new Error('Internal error: app instance missing');
  routedRoots.add(rootElement);
  registerAppInstance(instance as ComponentInstance, path, source);
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
  hydrateOptions: NonNullable<HydrateSPAConfig['hydrate']>,
  source?: {
    manifest?: RouteManifest;
    routes?: readonly Route[];
    auth?: RouteAuthOptions;
  }
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
    await registerAppNavigation(rootElement, path, source);
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
    await registerAppNavigation(rootElement, path, source);
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

  const manifest = config.manifest ?? config.registry?.manifest;
  const routeTable = config.routes ?? config.registry?.routes;
  const hasManifest = manifest != null && manifest.records.length > 0;
  const hasRoutes = Array.isArray(routeTable) && routeTable.length > 0;

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
  const hydrationRenderData = takeHydrationRenderData(rootElement);

  const pendingLazyAtHydrationBoot = [
    ..._snapshotLazy(),
    ..._snapshotRouteSourceLazy({ registry: config.registry, manifest }),
  ];

  configureScrollRestoration(config.scrollRestoration);

  clearRoutes();

  if (hasManifest) {
    _applyManifest(manifest!);
  } else {
    for (const r of routeTable!) {
      registerRoute(r.path, r.handler as Parameters<typeof registerRoute>[1]);
    }
  }

  const routeAuth = config.auth ?? manifest?.auth;
  const activeManifest = hasManifest ? manifest : undefined;
  const appRouteSource = {
    manifest: activeManifest,
    routes: hasManifest ? undefined : routeTable,
    auth: routeAuth,
  };
  _setActiveRouteAuthOptions(routeAuth);

  // Drain any lazy() imports so all split chunks are ready before mounting
  await _drainLazy(pendingLazyAtHydrationBoot);

  const {
    path,
    href: currentUrl,
    resolved,
  } = await resolveInitialRoute(routeAuth);
  setServerLocation(currentUrl);
  if (isProductionEnvironment()) lockRouteRegistration();

  if (!resolved) {
    throw new Error(`hydrateSPA: no route found for current path (${path}).`);
  }

  if (resolved.kind === 'redirect') {
    throw new Error(
      `hydrateSPA: unresolved redirect for current path (${path}).`
    );
  }

  const hydrationResolved: ResolvedRoute =
    resolved.kind === 'deny'
      ? { handler: bindDeniedStatus(resolved.status), params: {} }
      : { handler: resolved.handler, params: resolved.params };

  if (shouldVerifyHydrationMarkup(config)) {
    const legacyRouteTable = hasManifest
      ? manifest!.records.map((r) => ({
          ...r,
          path: r.path,
          handler: r.handler,
          namespace: r.options.namespace,
        }))
      : routeTable!;

    const { verifyHydrationSyncForUrl } =
      await import('../ssr/verify-hydration');
    if (
      !verifyHydrationSyncForUrl({
        root: rootElement,
        url: currentUrl,
        routes: legacyRouteTable,
        resolved: hydrationResolved,
        options: {
          data: hydrationRenderData ?? undefined,
        },
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
      if (hydrationRenderData) {
        startHydrationRenderPhase(hydrationRenderData);
      }
      try {
        await applySelectiveHydration(
          rootElement,
          hydrationResolved,
          path,
          config.cleanupStrict,
          hydrateOptions,
          appRouteSource
        );
      } finally {
        if (hydrationRenderData) {
          stopHydrationRenderPhase();
        }
      }
      return;
    }

    if (hydrateOptions.skipSelectors?.length) {
      markSkippedElements(rootElement, hydrateOptions.skipSelectors);
    }
  }

  if (hydrationRenderData) {
    startHydrationRenderPhase(hydrationRenderData);
  }
  try {
    mountOrUpdate(
      rootElement,
      resolved.kind === 'deny'
        ? bindDeniedStatus(resolved.status)
        : bindResolvedRouteHandler(hydrationResolved),
      {
        cleanupStrict: config.cleanupStrict,
      }
    );
  } finally {
    if (hydrationRenderData) {
      stopHydrationRenderPhase();
    }
  }
  await registerAppNavigation(rootElement, path, {
    ...appRouteSource,
  });
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

/**
 * Check whether an app is mounted on the given root
 */
export function hasApp(root: Element | string): boolean {
  const rootElement =
    typeof root === 'string' ? document.getElementById(root) : root;

  if (!rootElement) return false;
  return instancesByRoot.has(rootElement);
}
