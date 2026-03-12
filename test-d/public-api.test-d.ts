import { expectAssignable, expectType } from 'tsd';
import {
  derive,
  getRoutes,
  Link,
  navigate,
  registerRoute,
  route,
  selector,
  state,
  type Derived,
  type LinkProps,
  type RouteMatch,
  type RouteSnapshot,
} from '@askrjs/askr';
import {
  Link as RouterLink,
  layout,
  navigate as routerNavigate,
  route as routerRoute,
  type LinkProps as RouterLinkProps,
  type RouteQuery,
  type RouteSnapshot as RouterRouteSnapshot,
} from '@askrjs/askr/router';

const count = state(0);
const doubled = derive(() => count() * 2);
expectType<Derived<number>>(doubled);
expectType<number>(doubled());

const selectedId = state<number | null>(null);
const isSelected = selector(selectedId);
expectType<boolean>(isSelected(42));

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

const rootLinkProps: LinkProps = { href: '/about' };
Link(rootLinkProps);

const routerLinkProps: RouterLinkProps = { href: '/about' };
RouterLink(routerLinkProps);

const Shell = layout<{ title: string }>(({ children, title }) => ({
  children,
  title,
}));
expectAssignable<unknown>(Shell('content', { title: 'Docs' }));
