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
import { globalScheduler } from '../runtime/scheduler';
import { assertExecutionModel } from '../runtime/execution-model';

const HAS_ROUTES_KEY = Symbol.for('__ASKR_HAS_ROUTES__');

function getLogger() {
  return import('../dev/logger').then((m) => m.logger);
}

let componentIdCounter = 0;

// Track instances by root element to support multiple createIsland calls on same root
const instancesByRoot = new WeakMap<Element, ComponentInstance>();

// Symbol for storing cleanup on elements
const CLEANUP_SYMBOL = Symbol.for('__tempoCleanup__');

// Type for elements that have cleanup functions attached
interface ElementWithCleanup extends Element {
  [CLEANUP_SYMBOL]?: () => void;
}

function attachCleanupForRoot(
  rootElement: Element,
  instance: ComponentInstance
) {
  (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL] = () => {
    // Attempt to remove listeners and cleanup instances under the root.
    // In non-strict mode we preserve previous behavior by swallowing errors
    // (but logging in dev); in strict mode we aggregate and re-throw.
    const errors: unknown[] = [];
    try {
      removeAllListeners(rootElement);
    } catch (e) {
      errors.push(e);
    }

    // Manually traverse descendants and attempt to cleanup their instances.
    // Avoids import cycles by using local traversal and existing cleanupComponent.
    try {
      const descendants = rootElement.querySelectorAll('*');
      for (const d of Array.from(descendants)) {
        try {
          const inst = (d as Element & { __ASKR_INSTANCE?: ComponentInstance })
            .__ASKR_INSTANCE;
          if (inst) {
            try {
              cleanupComponent(inst);
            } catch (err) {
              errors.push(err);
            }
            try {
              delete (d as Element & { __ASKR_INSTANCE?: ComponentInstance })
                .__ASKR_INSTANCE;
            } catch (err) {
              errors.push(err);
            }
          }
        } catch (err) {
          errors.push(err);
        }
      }
    } catch (e) {
      errors.push(e);
    }

    try {
      cleanupComponent(instance as ComponentInstance);
    } catch (e) {
      errors.push(e);
    }

    if (errors.length > 0) {
      if (instance.cleanupStrict) {
        throw new AggregateError(errors, `cleanup failed for app root`);
      } else if (process.env.NODE_ENV !== 'production') {
        getLogger().then((logger) => {
          for (const err of errors) logger.warn('[Askr] cleanup error:', err);
        });
      }
    }
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
            try {
              removeAllListeners(rootElement);
            } catch (e) {
              if (instance.cleanupStrict) throw e;
              if (process.env.NODE_ENV !== 'production') {
                getLogger().then((logger) => {
                  logger.warn('[Askr] cleanup error:', e);
                });
              }
            }

            try {
              cleanupComponent(instance as ComponentInstance);
            } catch (e) {
              if (instance.cleanupStrict) throw e;
              if (process.env.NODE_ENV !== 'production') {
                getLogger().then((logger) => {
                  logger.warn('[Askr] cleanup error:', e);
                });
              }
            }
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

/**
 * Explicitly teardown an app mounted on `root` if present. This is the
 * recommended API for deterministic cleanup rather than relying on overriding
 * `innerHTML` setter behavior.
 */
export function teardownApp(_root: Element | string) {
  throw new Error(
    'The `teardownApp` alias has been removed. Use `cleanupApp(root)` instead.'
  );
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
  if (existingCleanup) existingCleanup();

  let instance = instancesByRoot.get(rootElement);

  if (instance) {
    removeAllListeners(rootElement);
    try {
      cleanupComponent(instance);
    } catch (e) {
      // If previous cleanup threw in strict mode, log but continue mounting new instance
      if (process.env.NODE_ENV !== 'production') {
        getLogger().then((logger) => {
          logger.warn('[Askr] prior cleanup threw:', e);
        });
      }
    }

    instance.fn = wrappedFn;
    instance.evaluationGeneration++;
    instance.mounted = false;
    instance.expectedStateIndices = [];
    instance.firstRenderComplete = false;
    instance.isRoot = true;
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

// New strongly-typed init functions
import type { Route, RouteManifest } from '../common/router';
import { removeAllListeners } from '../renderer';

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
   * Preferred: pass the route manifest built via `layout()` + `route()` calls.
   * ```ts
   * import { getManifest } from '@askrjs/askr/router';
   * await createSPA({ root: '#app', manifest: getManifest() });
   * ```
   */
  manifest?: RouteManifest;
  /** Legacy: flat route array — kept for backward compatibility and test fixtures. */
  routes?: Route[];
  cleanupStrict?: boolean;
  component?: never;
};

export type HydrateSPAConfig = {
  root: Element | string;
  /** Preferred manifest input — see `SPAConfig.manifest`. */
  manifest?: RouteManifest;
  /** Legacy flat route array. */
  routes?: Route[];
  cleanupStrict?: boolean;
  hydrate?: {
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

  const {
    clearRoutes,
    _applyManifest,
    _snapshotLazy,
    _drainLazy,
    route: registerRoute,
    lockRouteRegistration,
    resolveRouteWithGuards,
  } = await import('../router/route');

  const pendingLazyAtBoot = _snapshotLazy();

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

  // Drain any lazy() imports so all split chunks are ready before mounting
  await _drainLazy(pendingLazyAtBoot);

  // Lock registration in production to prevent late registration surprises
  if (process.env.NODE_ENV === 'production') lockRouteRegistration();

  // Mount the currently-resolved route handler (if any)
  let path = typeof window !== 'undefined' ? window.location.pathname : '/';
  let resolved = await Promise.resolve(resolveRouteWithGuards(path));

  while (typeof window !== 'undefined' && resolved && 'redirect' in resolved) {
    const redirectTarget = new URL(resolved.redirect, window.location.href);
    const redirectHref = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;
    window.history.replaceState({ path: redirectHref }, '', redirectHref);
    path = redirectTarget.pathname;
    resolved = await Promise.resolve(resolveRouteWithGuards(path));
  }

  if (!resolved || 'redirect' in resolved) {
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }), {
      cleanupStrict: config.cleanupStrict,
    });

    const { registerAppInstance, initializeNavigation } =
      await import('../router/navigate');
    const instance = instancesByRoot.get(rootElement);
    if (!instance) throw new Error('Internal error: app instance missing');
    registerAppInstance(instance as ComponentInstance, path);
    initializeNavigation();
    return;
  }

  mountOrUpdate(rootElement, resolved.handler as ComponentFunction, {
    cleanupStrict: config.cleanupStrict,
  });

  const { registerAppInstance, initializeNavigation } =
    await import('../router/navigate');
  const instance = instancesByRoot.get(rootElement);
  if (!instance) throw new Error('Internal error: app instance missing');
  registerAppInstance(instance as ComponentInstance, path);
  initializeNavigation();
}

/**
 * Mark elements that should be skipped during hydration
 */
function markSkippedElements(root: Element, skipSelectors: string[]): void {
  for (const selector of skipSelectors) {
    const elements = root.querySelectorAll(selector);
    elements.forEach((el) => el.setAttribute('data-skip-hydrate', 'true'));
  }
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

async function registerHydratedNavigation(rootElement: Element, path: string) {
  const { registerAppInstance, initializeNavigation } =
    await import('../router/navigate');
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

  if (hydrateOptions.skipSelectors?.length) {
    markSkippedElements(rootElement, hydrateOptions.skipSelectors);
  }

  let deferredBoundaries: Element[] = [];
  if (hydrateOptions.deferBelowFold) {
    const foldY = hydrateOptions.foldThreshold ?? window.innerHeight;
    deferredBoundaries = collectDeferredBelowFoldBoundaries(rootElement, foldY);

    const handleScroll = () => {
      const { activated, remaining } = activateVisibleDeferredBoundaries(
        deferredBoundaries,
        foldY
      );

      if (!activated) {
        return;
      }

      flushHydrationActivation(rootElement);

      if (remaining === 0) {
        window.removeEventListener('scroll', handleScroll);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  if (hydrateOptions.deferUntilIdle && !hasSelectiveBoundaries) {
    await queueIdleWork(() => {
      mountOrUpdate(rootElement, resolved.handler as ComponentFunction, {
        cleanupStrict,
      });
    });
    await registerHydratedNavigation(rootElement, path);
    return;
  }

  mountOrUpdate(rootElement, resolved.handler as ComponentFunction, {
    cleanupStrict,
  });
  await registerHydratedNavigation(rootElement, path);

  if (hydrateOptions.deferUntilIdle && deferredBoundaries.length > 0) {
    await queueIdleWork(() => {
      const { activated } = activateVisibleDeferredBoundaries(
        deferredBoundaries,
        Number.POSITIVE_INFINITY
      );
      if (activated) {
        flushHydrationActivation(rootElement);
      }
    });
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

  const {
    clearRoutes,
    _applyManifest,
    _snapshotLazy,
    _drainLazy,
    route: registerRoute,
    setServerLocation,
    lockRouteRegistration,
    resolveRoute,
  } = await import('../router/route');

  const pendingLazyAtHydrationBoot = _snapshotLazy();

  clearRoutes();

  if (hasManifest) {
    _applyManifest(config.manifest!);
  } else {
    for (const r of config.routes!) {
      registerRoute(r.path, r.handler as Parameters<typeof registerRoute>[1]);
    }
  }

  // Drain any lazy() imports so all split chunks are ready before mounting
  await _drainLazy(pendingLazyAtHydrationBoot);

  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const currentUrl =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : path;
  setServerLocation(currentUrl);
  if (process.env.NODE_ENV === 'production') lockRouteRegistration();

  const resolved = resolveRoute(path);
  if (!resolved) {
    throw new Error(`hydrateSPA: no route found for current path (${path}).`);
  }

  // Build a legacy-compatible routes array for the hydration verify call
  const legacyRouteTable = hasManifest
    ? config.manifest!.records.map((r) => ({
        path: r.path,
        handler: r.handler,
        namespace: r.options.namespace,
      }))
    : config.routes!;

  const { verifyHydrationSyncForUrl } = await import('../ssr');
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

  mountOrUpdate(rootElement, resolved.handler as ComponentFunction, {
    cleanupStrict: config.cleanupStrict,
  });
  await registerHydratedNavigation(rootElement, path);
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
  if (typeof cleanupFn === 'function') {
    cleanupFn();
  }

  instancesByRoot.delete(rootElement);
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
