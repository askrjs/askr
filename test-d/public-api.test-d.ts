import { expectAssignable, expectType } from 'tsd';
import {
  derive,
  Link,
  navigate,
  route,
  resource,
  selector,
  state,
  type Derived,
  type LinkProps,
  type RouteMatch,
  type RouteSnapshot,
} from '@askrjs/askr';
import {
  Link as RouterLink,
  getRoutes,
  layout,
  navigate as routerNavigate,
  registerRoute,
  route as routerRoute,
  type LinkProps as RouterLinkProps,
  type RouteQuery,
  type RouteSnapshot as RouterRouteSnapshot,
} from '@askrjs/askr/router';
import {
  getSignal,
  on,
  type ResourceResult,
} from '@askrjs/askr/resources';
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

const snapshot = route();
expectType<RouteSnapshot>(snapshot);
expectType<string>(snapshot.path);
expectType<string | null>(snapshot.query.get('q'));
expectType<Readonly<RouteQuery>>(snapshot.query);
expectType<readonly RouteMatch[]>(snapshot.matches);

expectType<RouterRouteSnapshot>(routerRoute());

navigate('/home');
routerNavigate('/about');
getRoutes();
registerRoute('/users/{id}', (params: Record<string, string>) => params.id);
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

const Shell = layout<{ title: string }>(({ children, title }) => ({
  children,
  title,
}));
expectAssignable<unknown>(Shell('content', { title: 'Docs' }));
