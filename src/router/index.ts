/**
 * askr/router — routing surface (explicit tier)
 */

export {
  registerRoutes,
  route,
  page,
  index,
  Outlet,
  currentRoute,
  group,
  fallback,
  lazy,
  createRouteRegistry,
  getManifest,
  getRoutes,
  clearRoutes,
} from './route';
export {
  allow,
  redirect,
  deny,
  unauthorized,
  forbidden,
  notFound,
  requireAuth,
  requireRole,
  requirePermission,
} from './policy';
export type {
  AccessDecision,
  AccessDenyDecision,
  AccessRedirectDecision,
  GroupHelperOptions,
  PageHelperOptions,
  RegisterRoutesOptions,
  RouteDefinition,
  Route,
  RouteAuthMode,
  RouteAuthOptions,
  RouteAuthResolver,
  RouteAuthState,
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
  ParsedSegment,
  LayoutScopeRecord,
  RouteRecord,
  RouteManifest,
  RouteRegistry,
  PageScopeRecord,
} from '../common/router';

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
