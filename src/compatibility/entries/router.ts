/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../router/index';
import type * as Contract from '../contracts/router/index';
export type * from '../contracts/router/index';

const public_Link: typeof Contract.Link =
  implementation.Link as unknown as typeof Contract.Link;
const public_Outlet: typeof Contract.Outlet = implementation.Outlet;
const public_Resolve: typeof Contract.Resolve =
  implementation.Resolve as unknown as typeof Contract.Resolve;
const public_RouteDataLoadError: typeof Contract.RouteDataLoadError =
  implementation.RouteDataLoadError;
type public_RouteDataLoadError = Contract.RouteDataLoadError;
const public_allow: typeof Contract.allow = implementation.allow;
const public_createRouteRegistry: typeof Contract.createRouteRegistry =
  implementation.createRouteRegistry as unknown as typeof Contract.createRouteRegistry;
const public_currentAuth: typeof Contract.currentAuth =
  implementation.currentAuth;
const public_currentRoute: typeof Contract.currentRoute =
  implementation.currentRoute;
const public_defer: typeof Contract.defer =
  implementation.defer as unknown as typeof Contract.defer;
const public_deny: typeof Contract.deny = implementation.deny;
const public_fallback: typeof Contract.fallback =
  implementation.fallback as unknown as typeof Contract.fallback;
const public_forbidden: typeof Contract.forbidden = implementation.forbidden;
const public_group: typeof Contract.group =
  implementation.group as unknown as typeof Contract.group;
const public_index: typeof Contract.index =
  implementation.index as unknown as typeof Contract.index;
const public_isDeferred: typeof Contract.isDeferred =
  implementation.isDeferred as unknown as typeof Contract.isDeferred;
const public_lazy: typeof Contract.lazy =
  implementation.lazy as unknown as typeof Contract.lazy;
const public_lazyRouteData: typeof Contract.lazyRouteData =
  implementation.lazyRouteData;
const public_navigate: typeof Contract.navigate = implementation.navigate;
const public_notFound: typeof Contract.notFound = implementation.notFound;
const public_onRouteChange: typeof Contract.onRouteChange =
  implementation.onRouteChange;
const public_page: typeof Contract.page = implementation.page;
const public_reconcileRouteMeta: typeof Contract.reconcileRouteMeta =
  implementation.reconcileRouteMeta;
const public_redirect: typeof Contract.redirect = implementation.redirect;
const public_resolveDeferredValues: typeof Contract.resolveDeferredValues =
  implementation.resolveDeferredValues;
const public_resolveRouteMeta: typeof Contract.resolveRouteMeta =
  implementation.resolveRouteMeta as unknown as typeof Contract.resolveRouteMeta;
const public_resolveRouteRequest: typeof Contract.resolveRouteRequest =
  implementation.resolveRouteRequest as unknown as typeof Contract.resolveRouteRequest;
const public_route: typeof Contract.route = implementation.route;
const public_routeData: typeof Contract.routeData = implementation.routeData;
const public_serializeRouteMeta: typeof Contract.serializeRouteMeta =
  implementation.serializeRouteMeta;
const public_to: typeof Contract.to = implementation.to;
const public_unauthorized: typeof Contract.unauthorized =
  implementation.unauthorized;
const public_updateRouteQuery: typeof Contract.updateRouteQuery =
  implementation.updateRouteQuery;

export {
  public_Link as Link,
  public_Outlet as Outlet,
  public_Resolve as Resolve,
  public_RouteDataLoadError as RouteDataLoadError,
  public_allow as allow,
  public_createRouteRegistry as createRouteRegistry,
  public_currentAuth as currentAuth,
  public_currentRoute as currentRoute,
  public_defer as defer,
  public_deny as deny,
  public_fallback as fallback,
  public_forbidden as forbidden,
  public_group as group,
  public_index as index,
  public_isDeferred as isDeferred,
  public_lazy as lazy,
  public_lazyRouteData as lazyRouteData,
  public_navigate as navigate,
  public_notFound as notFound,
  public_onRouteChange as onRouteChange,
  public_page as page,
  public_reconcileRouteMeta as reconcileRouteMeta,
  public_redirect as redirect,
  public_resolveDeferredValues as resolveDeferredValues,
  public_resolveRouteMeta as resolveRouteMeta,
  public_resolveRouteRequest as resolveRouteRequest,
  public_route as route,
  public_routeData as routeData,
  public_serializeRouteMeta as serializeRouteMeta,
  public_to as to,
  public_unauthorized as unauthorized,
  public_updateRouteQuery as updateRouteQuery,
};
