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
export {
  resource,
  derive,
  on,
  timer,
  task,
  stream,
  capture,
} from './runtime/operations';
export type { DataResult } from './runtime/operations';

// App bootstrap
export { createApp, hydrate, cleanupApp, hasApp } from './app/createApp';
export type { AppConfig } from './app/createApp';

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
  handle,
  catchError,
  tryWithLogging,
} from './stdlib';

// SSR - Server-side rendering
export { renderToString, renderToStringBatch, renderToStringSync } from './ssr';

// Re-export JSX runtime for tsconfig jsxImportSource
export { jsx, jsxs, Fragment } from './jsx/jsx-runtime';

// Public types
export type { Props } from './shared/types';
