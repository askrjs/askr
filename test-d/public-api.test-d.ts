import { expectAssignable, expectType } from 'tsd';
import {
  currentRoute,
  derive,
  index,
  Link,
  navigate,
  Outlet,
  type PageHelperOptions,
  type PageScopeRecord,
  page,
  route,
  resource,
  selector,
  state,
  type Derived,
  type LinkProps,
  type RouteMatch,
  type RouteRecord,
  type RouteSnapshot,
} from '@askrjs/askr';
import * as routerSurface from '@askrjs/askr/router';
import {
  Link as RouterLink,
  currentRoute as routerCurrentRoute,
  getManifest,
  getRoutes,
  navigate as routerNavigate,
  type LinkProps as RouterLinkProps,
  type PageHelperOptions as RouterPageHelperOptions,
  type PageScopeRecord as RouterPageScopeRecord,
  type RouteQuery,
  type RouteRecord as RouterRouteRecord,
  type RouteSnapshot as RouterRouteSnapshot,
} from '@askrjs/askr/router';
import { getSignal, on, type ResourceResult } from '@askrjs/askr/resources';
import { debounce, scheduleEventHandler } from '@askrjs/askr/fx';
import {
  cleanupApp,
  createIsland as createBootIsland,
  createSPA as createBootSPA,
  type IslandConfig,
  type SPAConfig,
} from '@askrjs/askr/boot';

const count = state(0);
const doubled = derive(() => count() * 2);
expectType<Derived<number>>(doubled);
expectType<number>(doubled());

const selectedId = state<number | null>(null);
const isSelected = selector(selectedId);
expectType<boolean>(isSelected(42));

const user = resource(async ({ signal }) => {
  expectType<AbortSignal>(signal);
  return 'ok';
}, []);
expectType<ResourceResult<string>>(user);

const snapshot = currentRoute();
expectType<RouteSnapshot>(snapshot);
expectType<string>(snapshot.path);
expectType<string | null>(snapshot.query.get('q'));
expectType<Readonly<RouteQuery>>(snapshot.query);
expectType<readonly RouteMatch[]>(snapshot.matches);

expectType<RouterRouteSnapshot>(routerCurrentRoute());

navigate('/home');
routerNavigate('/about');
getRoutes();
route('/users/{id}', (params: Record<string, string>) => params.id);
page(
  '/settings',
  () => null,
  () => {
    index(() => null);
    route('billing', () => null);
  }
);

const pageHelperOptions: PageHelperOptions = { auth: true };
expectAssignable<RouterPageHelperOptions>(pageHelperOptions);

const pageScopeRecord: PageScopeRecord = {
  component: () => null,
};
expectAssignable<RouterPageScopeRecord>(pageScopeRecord);

const manifest = getManifest();
expectType<PageScopeRecord[]>(manifest.records[0]!.pageChain);
expectType<RouterPageScopeRecord[]>(manifest.records[0]!.pageChain);

const routeRecord = manifest.records[0] as RouteRecord;
expectType<PageScopeRecord[]>(routeRecord.pageChain);
expectType<RouterRouteRecord['pageChain']>(routeRecord.pageChain);

expectType<unknown>(Outlet({} as never));
getSignal();
on(window, 'click', () => {});
expectType<(() => void) & { cancel(): void }>(debounce(() => {}, 10));
expectType<EventListener>(scheduleEventHandler(() => {}));

const rootLinkProps: LinkProps = { href: '/about' };
Link(rootLinkProps);

expectType<(config: IslandConfig) => void>(createBootIsland);
expectType<(config: SPAConfig) => Promise<void>>(createBootSPA);
expectType<(root: Element | string) => void>(cleanupApp);

const routerLinkProps: RouterLinkProps = { href: '/about' };
RouterLink(routerLinkProps);

expectAssignable<RouteSnapshot>(snapshot);

// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface._applyManifest;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface._drainLazy;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface.getNamespaceRoutes;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface.unloadNamespace;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface.getLoadedNamespaces;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface.resolveRouteRequest;
// @ts-expect-error internal router helpers are not part of the public barrel
routerSurface.setServerLocation;
