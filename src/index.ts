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

// Context
export { defineContext, readContext } from './runtime/context';
export type { Context } from './runtime/context';

// Resources
export { resource } from './runtime/operations';
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

// Routing
export {
  registerRoutes,
  route,
  currentRoute,
  group,
  fallback,
  lazy,
  allow,
  redirect,
  deny,
  unauthorized,
  forbidden,
  notFound,
  requireAuth,
  requireRole,
  requirePermission,
  resolveRouteRequest,
  type RouteSnapshot,
  type RouteMatch,
  type RouteComponent,
  type RouteMode,
  type RouteAuthMode,
  type RouteContext,
  type RoutePolicy,
  type RouteOptions,
  type RouteRecord,
  type RouteManifest,
  type AccessDecision,
  type AccessDenyDecision,
  type AccessRedirectDecision,
  type GroupHelperOptions,
  type RegisterRoutesOptions,
  type RouteDefinition,
  type RouteAuthOptions,
  type RouteAuthResolver,
  type RouteAuthState,
  type RouteRenderResult,
  type RouteRequestOptions,
  type RouteRequestResult,
} from './router';
export { navigate } from './router/navigate';
export type { NavigateOptions } from './router/navigate';

// Components
export { Link } from './components/link';
export type { LinkProps } from './components/link';
export { Case, For, Match, Show } from './control';
export type { CaseProps, ForProps, MatchProps, ShowProps } from './control';
export {
  Slot,
  definePortal,
  DefaultPortal,
  Portal,
} from './foundations/structures';
export type { SlotProps, Portal, PortalProps } from './foundations/structures';

// Re-export JSX runtime for tsconfig jsxImportSource
export { jsx, jsxs, Fragment } from './jsx-runtime';

// Public types
export type { Props } from './common/props';
