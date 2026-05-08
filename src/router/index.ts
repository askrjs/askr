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
  getManifest,
  _applyManifest,
  _drainLazy,
  getRoutes,
  clearRoutes,
  getNamespaceRoutes,
  unloadNamespace,
  getLoadedNamespaces,
  resolveRouteRequest,
  setServerLocation,
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
  RouteComponent,
  RouteOptions,
  ParsedSegment,
  LayoutScopeRecord,
  RouteRecord,
  RouteManifest,
  PageScopeRecord,
} from '../common/router';

export { navigate } from './navigate';
export type {
  NavigateOptions,
  NavigationScrollBehavior,
  HistoryScrollBehavior,
  ScrollRestorationOptions,
} from './navigate';

export { Link } from '../components/link';
export type { LinkProps } from '../components/link';
