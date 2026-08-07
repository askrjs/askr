/**
 * askr/router — routing surface (explicit tier)
 */

export {
  route,
  page,
  index,
  Outlet,
  currentRoute,
  currentAuth,
  group,
  fallback,
  lazy,
  lazyRouteData,
  createRouteRegistry,
} from './route';
export { onRouteChange } from './activity';
export type { RouteChangeCleanup, RouteChangeOptions } from './activity';
export {
  allow,
  redirect,
  deny,
  unauthorized,
  forbidden,
  notFound,
} from './policy';
export type {
  AccessDecision,
  AccessDenyDecision,
  AccessRedirectDecision,
  GroupHelperOptions,
  PageHelperOptions,
  RouteRegistryOptions,
  RouteDefinition,
  Route,
  RouteAuthOptions,
  RouteAuthResolver,
  RouteHandler,
  RouteMode,
  RouteContext,
  RoutePolicy,
  RouteRenderResult,
  RouteRequestOptions,
  RouteRequestResult,
  RouteSnapshot,
  RouteMatch,
  RouteQuery,
  RouteParams,
  RoutePathParams,
  RouteComponent,
  RouteOptions,
  RouteRef,
  RouteDestination,
  RouteSearch,
  RouteSearchValue,
  RouteMeta,
  RouteMetaSource,
  ParsedSegment,
  LayoutScopeRecord,
  RouteRecord,
  RouteManifest,
  RouteRegistry,
  PageScopeRecord,
} from '../common/router';
export type { LazyRouteComponent, LazyRouteDataLoader } from './lazy';
export type { RouteDataLoadPhase } from './route-data-loader';
export { RouteDataLoadError } from './route-data-loader';
export { to } from './destination';
export {
  reconcileRouteMeta,
  resolveRouteMeta,
  serializeRouteMeta,
} from './metadata';
export { resolveRouteRequest } from './resolution';
export {
  defer,
  isDeferred,
  resolveDeferredValues,
  routeData,
  Resolve,
} from './deferred';
export type { Deferred, DeferredState, ResolveProps } from './deferred';
export type { AuthContext, AuthRequirement } from '@askrjs/auth';

export { navigate, updateRouteQuery } from './navigate';
export type {
  NavigateOptions,
  NavigationScrollBehavior,
  HistoryScrollBehavior,
  ScrollRestorationOptions,
  RouteQueryParamValue,
  RouteQueryParamInput,
  RouteQueryUpdates,
  RouteQueryUpdater,
  UpdateRouteQueryOptions,
} from './navigate';

export { Link } from '../components/link';
export type { LinkProps } from '../components/link';
