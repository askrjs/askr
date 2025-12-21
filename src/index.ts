/**
 * Askr: Actor-backed deterministic UI framework
 *
 * Public API surface — only users should import from here
 */

// Runtime primitives
export { state } from './runtime/state';
export type { State } from './runtime/state';
export { getSignal } from './runtime/component';
export { scheduleEventHandler } from './runtime/scheduler';

// Context (spec-defined, currently stubbed)
export { defineContext, readContext } from './runtime/context';
export type { Context } from './runtime/context';

// Bindings (spec-defined, currently stubbed)
export { resource } from './runtime/operations';
export type { DataResult } from './runtime/operations';

// App bootstrap (explicit startup APIs)
export {
  createApp,
  createIsland,
  createSPA,
  hydrateSPA,
  cleanupApp,
  hasApp,
} from './app/createApp';
export type {
  IslandConfig,
  SPAConfig,
  HydrateSPAConfig,
} from './app/createApp';

// Routing
// Public render-time accessor: route() (also supports route registration when called with args)
export {
  route,
  setServerLocation,
  type RouteSnapshot,
  type RouteMatch,
} from './router/route';
export { layout } from './router/layouts';
// Keep route registration utilities available under a distinct name to avoid
// collision with the render-time accessor.
export {
  clearRoutes,
  getRoutes,
  getNamespaceRoutes,
  unloadNamespace,
  getLoadedNamespaces,
} from './router/route';
export { navigate } from './router/navigate';
export type { Route, RouteHandler } from './router/route';

// Components
export { Link } from './components/Link';
export type { LinkProps } from './components/Link';

// Standard library helpers are unstable and not re-exported from core.

// SSR - Server-side rendering (sync-only APIs)
export {
  renderToStringSync,
  renderToStringSyncForUrl,
  renderToString,
  renderToStream,
  collectResources,
  resolveResources,
} from './ssr';

// Re-export JSX runtime for tsconfig jsxImportSource
export { jsx, jsxs, Fragment } from './jsx/jsx-runtime';

// Expose common APIs to globalThis for test-suite compatibility (legacy test patterns)
// These are safe to export globally and make migrating tests simpler.
import { route, getRoutes } from './router/route';
import { navigate } from './router/navigate';
import {
  createApp,
  createIsland,
  createSPA,
  hydrateSPA,
} from './app/createApp';

if (typeof globalThis !== 'undefined') {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.createApp) g.createApp = createApp;
  if (!g.createIsland) g.createIsland = createIsland;
  if (!g.createSPA) g.createSPA = createSPA;
  if (!g.hydrateSPA) g.hydrateSPA = hydrateSPA;
  if (!g.route) g.route = route;
  if (!g.getRoutes) g.getRoutes = getRoutes;
  if (!g.navigate) g.navigate = navigate;
}

// Public types
export type { Props } from './shared/types';
