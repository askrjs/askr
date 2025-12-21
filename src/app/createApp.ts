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
import { removeAllListeners } from '../renderer/dom';
import { registerAppInstance, initializeNavigation } from '../router/navigate';

let componentIdCounter = 0;

// Track instances by root element to support multiple createApp calls on same root
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
}

/**
 * Bootstrap and mount app on client
 * Supports both sync and async components
 *
 * If createApp is called multiple times on the same root, the existing instance
 * is reused and its component function is updated. This ensures:
 * - Generation tokens work correctly (old async renders don't overwrite new ones)
 * - State is preserved across updates (if desired)
 * - DOM is diffed/updated rather than replaced
 */
// Backcompat wrapper for test-suite migration and user feedback.
// If called with `routes` a hard error is thrown to encourage migration to
// `createSPA`/`hydrateSPA`. Otherwise, delegate to `createIsland` to preserve
// legacy single-root enhancement behavior during the migration period.
export function createApp(config: AppConfig | SPAConfig): void {
  if (!config || typeof config !== 'object') {
    throw new Error('createApp requires a config object');
  }
  // Routed apps must use createSPA/hydrateSPA explicitly
  if ('routes' in config) {
    throw new Error(
      'The `createApp` API is removed. Use `createSPA({ root, routes })` for routed apps, or `hydrateSPA({ root, routes })` for SSR hydration.'
    );
  }
  // Treat remaining calls as islands for backwards compatibility during tests
  // and guide users to use `createIsland` in migration docs/tests.
  const appCfg = config as AppConfig;
  createIsland({
    root: appCfg.root,
    component: appCfg.component,
  });
}

// Shared mounting utilities used by the new startup APIs
function detectInvalidStateUsage(fn: ComponentFunction): string | null {
  try {
    const src = fn.toString();
    const returnPos = src.indexOf('return');
    const statePos = (() => {
      const direct = src.indexOf('state(');
      if (direct !== -1) return direct;
      const namespaced = src.indexOf('.state(');
      if (namespaced !== -1) return namespaced;
      const loose = src.indexOf('state');
      return loose;
    })();
    if (returnPos !== -1 && statePos !== -1 && statePos > returnPos) {
      return 'Invalid state() call after return: state() must be at the top level before any early returns.';
    }
    const hasTry = src.includes('try');
    const hasCatch = src.includes('catch');
    const mentionsState = src.includes('state') || src.includes('.state');
    if (hasTry && hasCatch && mentionsState) {
      const tryIndex = src.indexOf('try');
      const catchIndex = src.indexOf('catch');
      const stateCallIndex = src.indexOf('state(');
      if (stateCallIndex > tryIndex && stateCallIndex < catchIndex) {
        return 'Invalid state() usage inside try/catch: state() must be called at the top level without control flow.';
      }
    }
  } catch {
    // If toString() is unavailable (minified/native), skip heuristics
  }
  return null;
}

function attachCleanupForRoot(
  rootElement: Element,
  instance: ComponentInstance
) {
  (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL] = () => {
    removeAllListeners(rootElement);
    cleanupComponent(instance as ComponentInstance);
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
            removeAllListeners(rootElement);
            cleanupComponent(instance as ComponentInstance);
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

function mountOrUpdate(rootElement: Element, componentFn: ComponentFunction) {
  // Clean up existing cleanup function before mounting new one
  const existingCleanup = (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
  if (existingCleanup) existingCleanup();

  let instance = instancesByRoot.get(rootElement);

  if (instance) {
    removeAllListeners(rootElement);
    cleanupComponent(instance);

    const structuralErrorUpdate = detectInvalidStateUsage(componentFn);
    if (structuralErrorUpdate) {
      throw new Error(structuralErrorUpdate);
    }

    instance.fn = componentFn;
    instance.evaluationGeneration++;
    instance.mounted = false;
    instance.expectedStateIndices = [];
    instance.firstRenderComplete = false;
    instance.isRoot = true;
  } else {
    const structuralError = detectInvalidStateUsage(componentFn);
    if (structuralError) {
      throw new Error(structuralError);
    }

    const componentId = String(++componentIdCounter);
    instance = createComponentInstance(
      componentId,
      componentFn,
      {},
      rootElement
    );
    instancesByRoot.set(rootElement, instance);
    instance.isRoot = true;
  }

  attachCleanupForRoot(rootElement, instance);
  mountComponent(instance);
  globalScheduler.flush();
}

// New strongly-typed init functions
import type { Route } from '../router/route';

export type IslandConfig = {
  root: Element | string;
  component: ComponentFunction;
  // Explicitly disallow routes on islands at type level
  routes?: never;
};

export type SPAConfig = {
  root: Element | string;
  routes: Route[]; // routes are required
  component?: never;
};

export type HydrateSPAConfig = {
  root: Element | string;
  routes: Route[];
};

/**
 * createIsland: Enhances existing DOM (no router, mounts once)
 */
export function createIsland(config: IslandConfig): void {
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

  mountOrUpdate(rootElement, config.component);
}

/**
 * createSPA: Initializes router and mounts the app with provided route table
 */
export async function createSPA(config: SPAConfig): Promise<void> {
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
    mountOrUpdate(rootElement, () => ({ type: 'div', children: [] }));

    // Still register app instance and initialize navigation so future navigations work
    const instance = instancesByRoot.get(rootElement);
    if (!instance) throw new Error('Internal error: app instance missing');
    registerAppInstance(instance as ComponentInstance, path);
    initializeNavigation();
    return;
  }

  // Mount resolved handler as the root component
  // Convert resolved.handler to a ComponentFunction-compatible shape
  mountOrUpdate(rootElement, resolved.handler as ComponentFunction);

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
  const expectedHTML = renderToStringSync(
    () => resolved.handler(resolved.params) as ReturnType<ComponentFunction>
  );

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
  mountOrUpdate(rootElement, resolved.handler as ComponentFunction);

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
