import { expectAssignable, expectError, expectType } from 'tsd';
import {
  Link,
  Outlet,
  allow,
  clearRoutes,
  currentRoute,
  deny,
  forbidden,
  getManifest,
  getRoutes,
  group,
  index,
  lazy,
  navigate,
  notFound,
  page,
  redirect,
  registerRoutes,
  requireAuth,
  requirePermission,
  requireRole,
  route,
  unauthorized,
  type AccessDecision,
  type AccessDenyDecision,
  type AccessRedirectDecision,
  type GroupHelperOptions,
  type HistoryScrollBehavior,
  type LayoutScopeRecord,
  type LinkProps,
  type NavigateOptions,
  type NavigationScrollBehavior,
  type PageHelperOptions,
  type PageScopeRecord,
  type ParsedSegment,
  type RegisterRoutesOptions,
  type RouteComponent,
  type RouteContext,
  type RouteDefinition,
  type RouteHandler,
  type RouteManifest,
  type RouteMatch,
  type RouteMode,
  type RouteOptions,
  type RouteAuthMode,
  type RouteAuthOptions,
  type RouteAuthResolver,
  type RouteAuthState,
  type RouteParams,
  type RoutePathParams,
  type RoutePolicy,
  type RouteQuery,
  type RouteRecord,
  type RouteRequestOptions,
  type ScrollRestorationOptions,
  type RouteSnapshot,
} from '@askrjs/askr/router';

expectType<void>(
  registerRoutes(() => {
    group({}, () => {
      route('/users/{id}', (params) => {
        expectType<{ id: string }>(params);
        return params.id;
      });

      page(
        '/teams/{teamId}',
        (params) => {
          expectType<{ teamId: string }>(params);
          return params.teamId;
        },
        () => {
          route(
            'members/{memberId}',
            (params: { teamId: string; memberId: string }) => {
              expectType<string>(params.teamId);
              expectType<string>(params.memberId);
              return params.memberId;
            },
            {
              loader: ({ params }) => {
                expectType<{ teamId: string; memberId: string }>(params);
                return `${params.teamId}:${params.memberId}`;
              },
              entries: () => [{ teamId: 'core', memberId: '42' }],
            }
          );
        }
      );
    });
  })
);

route('/users/{id}', (params: Record<string, string>) => params.id);
route('/users/{id}', (params) => params.id, {
  loader: ({ params }) => {
    expectType<{ id: string }>(params);
    return params.id;
  },
  entries: () => [{ id: '1' }],
});

page(
  '/settings',
  () => null,
  () => {
    index(() => null);
    route('billing', () => null);
  }
);

const routeComponent: RouteComponent<{ id: string }> = (params) => [
  <span key="first">{params.id}</span>,
  <span key="second">detail</span>,
];
expectAssignable<RouteComponent<{ id: string }>>(routeComponent);

const routeHandler: RouteHandler<{ id: string }> = (params) => params.id;
expectAssignable<RouteHandler<{ id: string }>>(routeHandler);

const lazyRoute = lazy(async () => ({
  default: (params: { id: string }) => params.id,
}));
expectAssignable<RouteComponent<{ id: string }>>(lazyRoute);
route('/users/{id}', lazyRoute);

expectType<void>(navigate('/home'));
const navigateOptions: NavigateOptions = {
  history: 'replace',
  replace: true,
  scroll: 'top',
};
expectAssignable<NavigateOptions>(navigateOptions);
expectType<void>(navigate('/home', navigateOptions));

const snapshot = currentRoute();
expectType<RouteSnapshot>(snapshot);
expectType<string>(snapshot.path);
expectType<string | null>(snapshot.query.get('q'));
expectType<Readonly<RouteQuery>>(snapshot.query);
expectType<readonly RouteMatch[]>(snapshot.matches);

const typedSnapshot = currentRoute<{ id: string }>();
expectType<string>(typedSnapshot.params.id);

expectType<RoutePathParams<'/files/*'>>({ '*': 'docs/readme.md' });
expectType<RoutePathParams<'/files/{*path}'>>({ path: 'docs/readme.md' });

route('/files/{*path}', (params) => {
  expectType<{ path: string }>(params);
  return params.path;
});

const manifest = getManifest();
expectType<RouteManifest>(manifest);
const routeRecord = manifest.records[0] as RouteRecord;
expectType<PageScopeRecord[]>(routeRecord.pageChain);
expectType<RouteRecord['pageChain']>(routeRecord.pageChain);
expectType<ReturnType<typeof getRoutes>>(getRoutes());

const pageHelperOptions: PageHelperOptions = { auth: true };
expectAssignable<PageHelperOptions>(pageHelperOptions);
const groupHelperOptions: GroupHelperOptions = {
  layout: ({ children }) => <div>{children}</div>,
  auth: 'guest',
};
expectAssignable<GroupHelperOptions>(groupHelperOptions);

const pageScopeRecord: PageScopeRecord = {
  component: () => [<span key="page">page</span>],
};
expectAssignable<PageScopeRecord>(pageScopeRecord);
const layoutScopeRecord: LayoutScopeRecord = {
  component: ({ children }) => <div>{children}</div>,
};
expectAssignable<LayoutScopeRecord>(layoutScopeRecord);

const routeDefinition: RouteDefinition = () => {};
expectAssignable<RouteDefinition>(routeDefinition);

const routeMode: RouteMode = 'ssr';
expectAssignable<RouteMode>(routeMode);

const routeAuthMode: RouteAuthMode = 'guest';
expectAssignable<RouteAuthMode>(routeAuthMode);

const routeParams: RouteParams = { id: '123' };
expectAssignable<RouteParams>(routeParams);

const routeContext: RouteContext = {
  mode: routeMode,
  params: routeParams,
  pathname: '/users/123',
  search: '?tab=profile',
  hash: '#details',
  href: '/users/123?tab=profile#details',
  session: null,
  user: null,
  signal: new AbortController().signal,
};
expectAssignable<RouteContext>(routeContext);

const routeAuthState: RouteAuthState = {
  session: null,
  user: null,
};
expectAssignable<RouteAuthState>(routeAuthState);

const routeAuthResolver: RouteAuthResolver = (context) => {
  expectType<string>(context.pathname);
  return routeAuthState;
};
expectAssignable<RouteAuthResolver>(routeAuthResolver);

const routeAuthOptions: RouteAuthOptions = {
  resolve: routeAuthResolver,
  loginPath: '/login',
};
expectAssignable<RouteAuthOptions>(routeAuthOptions);

const registerRoutesOptions: RegisterRoutesOptions = {
  auth: routeAuthOptions,
};
expectAssignable<RegisterRoutesOptions>(registerRoutesOptions);

const routeRequestOptions: RouteRequestOptions = {
  manifest,
  mode: routeMode,
  auth: routeAuthOptions,
  signal: new AbortController().signal,
};
expectAssignable<RouteRequestOptions>(routeRequestOptions);

const routeOptions: RouteOptions<{ id: string }> = {
  auth: routeAuthMode,
  loader: ({ params }) => params.id,
  entries: () => [{ id: '123' }],
  title: 'User',
  namespace: 'users',
};
expectAssignable<RouteOptions<{ id: string }>>(routeOptions);

const parsedSegment: ParsedSegment = {
  kind: 'param',
  value: 'id',
};
expectAssignable<ParsedSegment>(parsedSegment);

const navigationScrollBehavior: NavigationScrollBehavior = 'preserve';
expectAssignable<NavigationScrollBehavior>(navigationScrollBehavior);
const historyScrollBehavior: HistoryScrollBehavior = 'restore';
expectAssignable<HistoryScrollBehavior>(historyScrollBehavior);
const scrollRestorationOptions: ScrollRestorationOptions = {
  navigation: navigationScrollBehavior,
  history: historyScrollBehavior,
};
expectAssignable<ScrollRestorationOptions>(scrollRestorationOptions);

const linkProps: LinkProps = {
  href: '/about',
  children: [<span key="first">About</span>, <span key="second">now</span>],
};
expectAssignable<LinkProps>(linkProps);
Link(linkProps);
expectAssignable<JSX.Element>(<Outlet />);
expectAssignable<JSX.Element>(Outlet());
expectError(Link({ href: '/about', children: document.createElement('span') }));

const allowDecision = allow();
expectAssignable<AccessDecision>(allowDecision);
expectType<'allow'>(allowDecision.kind);

const redirectDecision = redirect('/login', { replace: true });
expectAssignable<AccessDecision>(redirectDecision);
expectAssignable<AccessRedirectDecision>(redirectDecision);
expectType<'redirect'>(redirectDecision.kind);
expectType<string>(redirectDecision.to);
expectType<boolean | undefined>(redirectDecision.replace);

const denyDecision = deny(403);
expectAssignable<AccessDecision>(denyDecision);
expectAssignable<AccessDenyDecision>(denyDecision);
expectType<'deny'>(denyDecision.kind);
expectType<401 | 403 | 404>(denyDecision.status);

expectAssignable<AccessDecision>(unauthorized());
expectAssignable<AccessDecision>(forbidden());
expectAssignable<AccessDecision>(notFound());
expectAssignable<RoutePolicy>(requireAuth());
expectAssignable<RoutePolicy>(requireRole('admin'));
expectAssignable<RoutePolicy>(requirePermission('write:users'));
expectType<void>(clearRoutes());

expectError(navigate('/home', { history: 'invalid' }));
expectError(route('/bad', 'not-a-component'));
expectError(route('/bad-dom', () => document.createElement('div')));
expectError(
  page(
    '/bad-page',
    () => document.createElement('div'),
    () => {}
  )
);
expectError(group({ layout: () => document.createElement('div') }, () => {}));
expectError(route('/users/{id}', (params: { slug: string }) => params.slug));
expectError(
  route('/users/{id}', () => null, {
    entries: () => [{ slug: 'wrong' }],
  })
);
expectError(
  registerRoutes(() => {
    page(
      '/teams/{teamId}',
      () => null,
      () => {
        route(
          'members/{memberId}',
          (params: { teamId: string; memberId: string }) => {
            return params.memberId;
          },
          {
            entries: () => [{ memberId: '42' }],
          }
        );
      }
    );
  })
);
expectError(lazy(async () => ({ nope: () => null })));
expectError(
  lazy(async () => ({ default: () => document.createElement('div') }))
);
