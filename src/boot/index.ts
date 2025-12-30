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
import { logger } from '../dev/logger';
import { registerAppInstance, initializeNavigation } from '../router/navigate';
import { assertExecutionModel } from '../runtime/execution-model';

const HAS_ROUTES_KEY = Symbol.for('__ASKR_HAS_ROUTES__');

let componentIdCounter = 0;

// Track instances by root element to support multiple createIsland calls on same root
const instancesByRoot = new WeakMap<Element, ComponentInstance>();

// Symbol for storing cleanup on elements
const CLEANUP_SYMBOL = Symbol.for('__tempoCleanup__');

// Type for elements that have cleanup functions attached
interface ElementWithCleanup extends Element {
  [CLEANUP_SYMBOL]?: () => void;
}

export interface AppConfig {
  root: Element | string;
  component: ComponentFunction;
  // Opt-in: surface cleanup errors during teardown for this app instance
  cleanupStrict?: boolean;
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
        for (const err of errors) logger.warn('[Askr] cleanup error:', err);
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
              if (process.env.NODE_ENV !== 'production')
                logger.warn('[Askr] cleanup error:', e);
            }

            try {
              cleanupComponent(instance as ComponentInstance);
            } catch (e) {
              if (instance.cleanupStrict) throw e;
              if (process.env.NODE_ENV !== 'production')
                logger.warn('[Askr] cleanup error:', e);
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
      if (process.env.NODE_ENV !== 'production')
        logger.warn('[Askr] prior cleanup threw:', e);
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
import type { Route } from '../common/router';
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
  routes: Route[]; // routes are required
  // Optional: surface cleanup errors during teardown for this SPA
  cleanupStrict?: boolean;
  component?: never;
};

export type HydrateSPAConfig = {
  root: Element | string;
  routes: Route[];
  // Optional: surface cleanup errors during teardown for this SPA
  cleanupStrict?: boolean;
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
 * createSPA: Initializes router and mounts the app with provided route table
 */
export async function createSPA(config: SPAConfig): Promise<void> {
  assertExecutionModel('spa');
  if (!config || typeof config !== 'object') {
    throw new Error('createSPA requires a config object');
  }
  if (!Array.isArray(config.routes) || config.routes.length === 0) {
    throw new Error(
      'createSPA requires a route table. If you are enhancing existing HTML, use createIsland instead.'
    );
  }

  const rootElement =
    typeof config.root === 'string'
      ? document.getElementById(config.root)
      : config.root;
  if (!rootElement) throw new Error(`Root element not found: ${config.root}`);

  // Register routes at startup (clear previous registrations to avoid surprises)
  const { clearRoutes, route, lockRouteRegistration, resolveRoute } =
    await import('../router/route');

  clearRoutes();
  for (const r of config.routes) {
    // Using typed Route from router; allow handler functions
    route(r.path, r.handler, r.namespace);
  }
  // Lock registration in production to prevent late registration surprises
  if (process.env.NODE_ENV === 'production') lockRouteRegistration();

  // Mount the currently-resolved route handler (if any)
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const resolved = resolveRoute(path);
  if (!resolved) {
    // If no route currently matches, mount an empty placeholder and continue.
    // This supports cases where routes are registered but the current URL is
    // not one of them (common in router tests that navigate programmatically).
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(
        `createSPA: no route found for current path (${path}). Mounting empty placeholder; navigation will activate routes when requested.`
      );
    }

    // Mount a no-op component until navigation occurs
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }), {
      cleanupStrict: false,
    });

    // Still register app instance and initialize navigation so future navigations work
    const instance = instancesByRoot.get(rootElement);
    if (!instance) throw new Error('Internal error: app instance missing');
    registerAppInstance(instance as ComponentInstance, path);
    initializeNavigation();
    return;
  }

  // Mount resolved handler as the root component
  // Convert resolved.handler to a ComponentFunction-compatible shape
  mountOrUpdate(rootElement, resolved.handler as ComponentFunction, {
    cleanupStrict: false,
  });

  // Register for navigation and wire up history handling
  const instance = instancesByRoot.get(rootElement);
  if (!instance) throw new Error('Internal error: app instance missing');
  registerAppInstance(instance as ComponentInstance, path);
  initializeNavigation();
}

/**
 * hydrateSPA: Hydrate server-rendered HTML with explicit routes
 */
export async function hydrateSPA(config: HydrateSPAConfig): Promise<void> {
  assertExecutionModel('spa');
  if (!config || typeof config !== 'object') {
    throw new Error('hydrateSPA requires a config object');
  }
  if (!Array.isArray(config.routes) || config.routes.length === 0) {
    throw new Error(
      'hydrateSPA requires a route table. If you are enhancing existing HTML, use createIsland instead.'
    );
  }

  const rootElement =
    typeof config.root === 'string'
      ? document.getElementById(config.root)
      : config.root;
  if (!rootElement) throw new Error(`Root element not found: ${config.root}`);

  // Capture server HTML for mismatch detection
  const serverHTML = rootElement.innerHTML;

  // Register routes for hydration and set server location for deterministic route()
  const {
    clearRoutes,
    route,
    setServerLocation,
    lockRouteRegistration,
    resolveRoute,
  } = await import('../router/route');

  clearRoutes();
  for (const r of config.routes) {
    route(r.path, r.handler, r.namespace);
  }
  // Set server location so route() reflects server URL during SSR checks
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  setServerLocation(path);
  if (process.env.NODE_ENV === 'production') lockRouteRegistration();

  // Resolve handler for current path
  const resolved = resolveRoute(path);
  if (!resolved) {
    throw new Error(`hydrateSPA: no route found for current path (${path}).`);
  }

  // Synchronously render expected HTML using SSR helper
  const { renderToStringSync } = await import('../ssr');
  // renderToStringSync takes a zero-arg component factory; wrap the handler to pass params
  const expectedHTML = renderToStringSync(() => {
    const out = resolved.handler(resolved.params);
    return (out ?? {
      type: 'div',
      children: [],
    }) as ReturnType<ComponentFunction>;
  });

  // Prefer a DOM-based comparison to avoid false positives from attribute order
  // or whitespace differences between server and expected HTML.
  const serverContainer = document.createElement('div');
  serverContainer.innerHTML = serverHTML;
  const expectedContainer = document.createElement('div');
  expectedContainer.innerHTML = expectedHTML;

  if (!serverContainer.isEqualNode(expectedContainer)) {
    throw new Error(
      '[Askr] Hydration mismatch detected. Server HTML does not match expected server-render output.'
    );
  }

  // Proceed to mount the client SPA (this will attach listeners and start navigation)
  // Reuse createSPA path but we already registered routes and set server location, so just mount
  // Mount resolved handler
  mountOrUpdate(rootElement, resolved.handler as ComponentFunction, {
    cleanupStrict: false,
  });

  // Register navigation and instance
  const { registerAppInstance, initializeNavigation } =
    await import('../router/navigate');
  const instance = instancesByRoot.get(rootElement);
  if (!instance) throw new Error('Internal error: app instance missing');
  registerAppInstance(instance as ComponentInstance, path);
  initializeNavigation();
}

export async function hydrate(_config: AppConfig): Promise<void> {
  throw new Error(
    'The legacy `hydrate` API is removed. Use `hydrateSPA({ root, routes })` for SSR hydration with an explicit route table.'
  );
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
