/**
 * Route definition, registration, and matching.
 *
 * This file is the compatibility facade for internal router modules. Keep
 * public and historical internal imports stable by re-exporting from the
 * focused implementation modules.
 */

export {
  group,
  page,
  index,
  fallback,
  registerRoutes,
  route,
} from './authoring';
export {
  currentRoute,
  isRoutePathActive,
  setServerLocation,
  syncCurrentRouteSnapshot,
} from './activity';
export {
  computeRouteActivityMatches,
  resolveRoute,
  resolveRouteFromRoutes,
  resolveRouteRequest,
  _resolveRouteMatchFromRoutes,
} from './resolution';
export {
  _applyManifest,
  clearRoutes,
  createRouteRegistry,
  getManifest,
} from './manifest';
export {
  getLoadedNamespaces,
  getNamespaceRoutes,
  getRoutes,
  hasRegisteredRoutes,
  lockRouteRegistration,
  unloadNamespace,
  _lockRouteRegistrationForTests,
  _setActiveRouteAuthOptions,
  _unlockRouteRegistrationForTests,
} from './store';
export {
  _drainLazy,
  _snapshotLazy,
  _snapshotRouteSourceLazy,
  lazy,
} from './lazy';
export { Outlet } from './rendering';

export type {
  AccessDecision,
  AccessDenyDecision,
  AccessRedirectDecision,
  GroupHelperOptions,
  PageHelperOptions,
  RegisterRoutesOptions,
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
