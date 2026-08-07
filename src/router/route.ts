/**
 * Route definition, registration, and matching.
 *
 * This file is the compatibility facade for internal router modules. Keep
 * public and historical internal imports stable by re-exporting from the
 * focused implementation modules.
 */

export { group, page, index, fallback, route } from './authoring';
export {
  currentRoute,
  isRoutePathActive,
  setServerLocation,
  syncCurrentRouteSnapshot,
} from './activity';
export { currentAuth } from './auth';
export { resolveRoute, resolveRouteRequest } from './resolution';
export { _applyManifest, createRouteRegistry } from './manifest';
export {
  getLoadedNamespaces,
  getNamespaceRoutes,
  hasRegisteredRoutes,
  lockRouteRegistration,
  unloadNamespace,
  _lockRouteRegistrationForTests,
  _setActiveRouteAuthOptions,
  _unlockRouteRegistrationForTests,
} from './store';
export { _drainLazy, _snapshotLazy, lazy, lazyRouteData } from './lazy';
export { Outlet } from './rendering';

export type {
  AccessDecision,
  AccessDenyDecision,
  AccessRedirectDecision,
  GroupHelperOptions,
  PageHelperOptions,
  RouteRegistryOptions,
  RouteDefinition,
  RouteAuthOptions,
  RouteHandler,
  Route,
  RouteContext,
  RoutePolicy,
  RouteRenderResult,
  RouteRequestOptions,
  RouteRequestResult,
  ResolvedRoute,
  RouteMatch,
  RouteQuery,
  RouteSnapshot,
  RouteParams,
  RoutePathParams,
  RouteComponent,
  RouteOptions,
  ParsedSegment,
  LayoutScopeRecord,
  PageScopeRecord,
  RouteRecord,
  RouteManifest,
  RouteRegistry,
} from '../common/router';
export type { LazyRouteComponent, LazyRouteDataLoader } from './lazy';
export type { RouteDataLoadPhase } from './route-data-loader';
export { RouteDataLoadError } from './route-data-loader';
