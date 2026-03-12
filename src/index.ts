/**
 * Askr: Actor-backed deterministic UI framework
 *
 * Public API surface — only users should import from here
 */

import { installRendererBridge } from './renderer';

installRendererBridge();

// Runtime primitives
export { state } from './runtime/state';
export type { State } from './runtime/state';
export { derive } from './runtime/derive';
export type { Derived } from './runtime/derive';
export { getSignal } from './runtime/component';
export { selector } from './runtime/selector';
export type { Selector } from './runtime/selector';
export { scheduleEventHandler } from './runtime/scheduler';

// Context (spec-defined, currently stubbed)
export { defineContext, readContext } from './runtime/context';
export type { Context } from './runtime/context';

// Bindings (spec-defined, currently stubbed)
export {
  resource,
  on,
  timer,
  task,
  stream,
  capture,
} from './runtime/operations';
export type { ResourceResult } from './runtime/operations';

// App bootstrap
export {
  createIsland,
  createIslands,
  createSPA,
  hydrateSPA,
  cleanupApp,
  hasApp,
} from './boot';
export type {
  IslandConfig,
  IslandsConfig,
  SPAConfig,
  HydrateSPAConfig,
} from './boot';
// Backwards compatibility aliases
import { createSPA, hydrateSPA } from './boot';
import type { SPAConfig } from './boot';
export const createApp = createSPA;
export const hydrate = hydrateSPA;
export type AppConfig = SPAConfig;

// Routing
// Public render-time accessor: route() (also supports route registration when called with args)
export {
  route,
  setServerLocation,
  type RouteSnapshot,
  type RouteMatch,
} from './router/route';
// Keep route registration utilities available under a distinct name to avoid
// collision with the render-time accessor.
export {
  registerRoute,
  // keep a deprecated alias for backward compatibility
  registerRoute as defineRoute,
  clearRoutes,
  getRoutes,
  getNamespaceRoutes,
  unloadNamespace,
  getLoadedNamespaces,
} from './router/route';
export { navigate } from './router/navigate';
export type { Route, RouteHandler } from './router/route';

// Components
export { Link } from './components/link';
export type { LinkProps } from './components/link';
export { For } from './for';

// Standard library — timing utilities
export {
  debounce,
  throttle,
  once,
  defer,
  raf,
  idle,
  timeout,
  retry,
  type DebounceOptions,
  type ThrottleOptions,
  type RetryOptions,
  debounceEvent,
  throttleEvent,
  rafEvent,
  scheduleTimeout,
  scheduleIdle,
  scheduleRetry,
} from './fx';

// SSR - Server-side rendering
export { renderToString, renderToStringSync } from './ssr';

// Re-export JSX runtime for tsconfig jsxImportSource
export { jsx, jsxs, Fragment } from './jsx/jsx-runtime';

// Public types
export type { Props } from './common/props';
