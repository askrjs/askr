import { expectAssignable, expectError, expectType } from 'tsd';
import {
  requirePermission,
  requireRole,
  requireUser,
  type AuthContext,
  type AuthRequirement,
} from '@askrjs/auth';
import { schema } from '@askrjs/schema';
import {
  Link,
  Outlet,
  allow,
  currentRoute,
  currentAuth,
  deny,
  forbidden,
  createRouteRegistry,
  group,
  index,
  lazy,
  lazyRouteData,
  navigate,
  notFound,
  page,
  redirect,
  reconcileRouteMeta,
  resolveRouteMeta,
  route,
  serializeRouteMeta,
  to,
  unauthorized,
  updateRouteQuery,
  type AccessDecision,
  type AccessDenyDecision,
  type AccessRedirectDecision,
  type GroupHelperOptions,
  type HistoryScrollBehavior,
  type LayoutScopeRecord,
  type LazyRouteComponent,
  type LazyRouteDataLoader,
  type LinkProps,
  type NavigateOptions,
  type NavigationScrollBehavior,
  type PageHelperOptions,
  type PageScopeRecord,
  type ParsedSegment,
  type RouteRegistryOptions,
  type RouteComponent,
  type RouteContext,
  type RouteDefinition,
  type RouteDestination,
  RouteDataLoadError,
  type RouteDataLoadPhase,
  type RouteHandler,
  type RouteManifest,
  type Route,
  type RouteMatch,
  type RouteMeta,
  type RouteMetaSource,
  type RouteMode,
  type RouteOptions,
  type RoutePolicy,
  type RouteAuthOptions,
  type RouteAuthResolver,
  type RouteParams,
  type RoutePathParams,
  type RouteQuery,
  type RouteRecord,
  type RouteRegistry,
  type RouteRequestOptions,
  type RouteRef,
  type RouteSearch,
  type RouteSearchValue,
  type ScrollRestorationOptions,
  type RouteSnapshot,
  type RouteQueryParamInput,
  type RouteQueryParamValue,
  type RouteQueryUpdater,
  type RouteQueryUpdates,
  type UpdateRouteQueryOptions,
} from '@askrjs/askr/router';

const typedUserRoute = route('/typed-users/{id}', (params) => params.id, {
  search: schema.object({
    tab: schema.enum(['profile', 'security'] as const),
    page: schema.optional(schema.integer()),
  }),
});
const lazyDocs = lazyRouteData(
  async () => ({ pages: { intro: 'Introduction' } }),
  (module, context) => {
    expectAssignable<RouteContext>(context);
    return module.pages.intro;
  }
);
expectType<LazyRouteDataLoader<{ pages: { intro: string } }, string>>(lazyDocs);
expectType<Promise<void>>(lazyDocs.preload());
expectAssignable<RouteDataLoadPhase>('client');
expectType<RouteDataLoadError>(
  new RouteDataLoadError('/docs', 'client', new Error('failed'))
);
expectError(route('/scalar-search', () => null, { search: schema.string() }));
expectAssignable<
  RouteRef<{ id: string }, { tab: 'profile' | 'security'; page?: number }>
>(typedUserRoute);
const typedUserDestination = to(
  typedUserRoute,
  { id: 'a/b' },
  { tab: 'profile', page: 2 }
);
expectType<RouteDestination>(typedUserDestination);
expectType<string>(typedUserDestination.href);
expectError(to(typedUserRoute, {}, { tab: 'profile' }));
expectError(to(typedUserRoute, { id: '1' }, { tab: 'other' }));
expectAssignable<RouteSearch>({ q: 'askr', tags: ['runtime', 'router'] });
expectAssignable<RouteSearchValue>(['runtime', 'router']);

expectType<RouteRegistry>(
  createRouteRegistry(() => {
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

const registry = createRouteRegistry(() => {
  route('/registry/{id}', (params) => params.id);
});
expectType<RouteRegistry>(registry);
expectType<RouteManifest>(registry.manifest);
expectType<readonly import('@askrjs/askr/router').Route[]>(registry.routes);
expectError<RouteRegistry>({
  manifest: registry.manifest,
  routes: registry.routes,
});

route('/users/{id}', (params: Record<string, string>) => params.id);
route('/users/{id}', (params) => params.id, {
  loader: ({ params }) => {
    expectType<{ id: string }>(params);
    return params.id;
  },
  entries: () => [{ id: '1' }],
});

route('/dehydrate/{id}', () => null, {
  loader: ({ params }) => ({
    visible: params.id,
    secret: 42,
  }),
  dehydrate: (data, context) => {
    expectType<{ visible: string; secret: number }>(data);
    expectType<{ id: string }>(context.params);
    return { visible: data.visible };
  },
});
expectError(
  route('/async-dehydrate', () => null, {
    loader: () => ({ visible: 'value' }),
    dehydrate: async (data) => ({ visible: data.visible }),
  })
);

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
expectAssignable<LazyRouteComponent<RouteComponent<{ id: string }>>>(lazyRoute);
expectType<Promise<void>>(lazyRoute.preload());
route('/users/{id}', lazyRoute);

expectType<void>(navigate('/home'));
const navigateOptions: NavigateOptions = {
  history: 'replace',
  replace: true,
  scroll: 'top',
};
expectAssignable<NavigateOptions>(navigateOptions);
expectType<void>(navigate('/home', navigateOptions));

const updateRouteQueryOptions: UpdateRouteQueryOptions = {
  history: 'replace',
  replace: true,
};
expectAssignable<UpdateRouteQueryOptions>(updateRouteQueryOptions);
expectType<void>(updateRouteQuery({ q: 'northwind' }));
expectType<void>(updateRouteQuery({ q: null, page: 2, tags: ['ops'] }));
expectType<void>(
  updateRouteQuery((searchParams) => {
    expectType<URLSearchParams>(searchParams);
    searchParams.set('q', 'northwind');
  }, updateRouteQueryOptions)
);
expectAssignable<RouteQueryParamValue>('northwind');
expectAssignable<RouteQueryParamInput>(['ops', 'billing']);
expectAssignable<RouteQueryUpdater>((searchParams) => {
  searchParams.delete('q');
});
expectAssignable<RouteQueryUpdates>({ q: 'northwind', page: 2 });

const snapshot = currentRoute();
expectType<AuthContext>(currentAuth());
expectType<RouteSnapshot>(snapshot);
expectType<string>(snapshot.path);
expectType<string | null>(snapshot.query.get('q'));
expectType<Readonly<RouteQuery>>(snapshot.query);
expectType<readonly RouteMatch[]>(snapshot.matches);

const typedSnapshot = currentRoute<{ id: string }>();
expectType<string>(typedSnapshot.params.id);

expectType<RoutePathParams<'/files/*'>>({ '*': 'docs/readme.md' });
expectType<RoutePathParams<'/files/{*path}'>>({ path: 'docs/readme.md' });
expectType<RoutePathParams<'/files/{* path }'>>({ path: 'docs/readme.md' });

route('/files/{*path}', (params) => {
  expectType<{ path: string }>(params);
  return params.path;
});

route('/files/{* path }', (params) => {
  expectType<{ path: string }>(params);
  return params.path;
});

const manifest = registry.manifest;
expectType<RouteManifest>(manifest);
const routeRecord = manifest.records[0] as RouteRecord;
expectType<PageScopeRecord[]>(routeRecord.pageChain);
expectType<RouteRecord['pageChain']>(routeRecord.pageChain);
expectType<readonly Route[]>(registry.routes);

const pageHelperOptions: PageHelperOptions = { auth: requireUser() };
expectAssignable<PageHelperOptions>(pageHelperOptions);
const groupHelperOptions: GroupHelperOptions = {
  layout: ({ children }) => <div>{children}</div>,
  auth: requireRole('admin'),
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

const routeParams: RouteParams = { id: '123' };
expectAssignable<RouteParams>(routeParams);

const routeContext: RouteContext = {
  mode: routeMode,
  params: routeParams,
  pathname: '/users/123',
  search: '?tab=profile',
  hash: '#details',
  href: '/users/123?tab=profile#details',
  auth: {
    authenticated: false,
    principal: null,
    session: null,
    tenant: null,
  },
  signal: new AbortController().signal,
};
expectAssignable<RouteContext>(routeContext);
const routeMeta: RouteMeta = {
  title: 'User',
  html: { lang: 'en', dir: 'ltr' },
};
expectAssignable<RouteMeta>(routeMeta);
const routeMetaSource: RouteMetaSource = (context) => ({
  title: context.pathname,
});
expectAssignable<RouteMetaSource>(routeMetaSource);
expectType<string>(serializeRouteMeta(routeMeta));
expectType<Promise<Readonly<RouteMeta>>>(
  resolveRouteMeta(routeRecord, routeContext)
);

const anonymousAuthContext: AuthContext = {
  authenticated: false,
  principal: null,
  session: null,
  tenant: null,
};
expectAssignable<AuthContext>(anonymousAuthContext);

const routeAuthResolver: RouteAuthResolver = (context) => {
  expectType<string>(context.pathname);
  return anonymousAuthContext;
};
expectAssignable<RouteAuthResolver>(routeAuthResolver);

const routeAuthOptions: RouteAuthOptions = {
  resolve: routeAuthResolver,
  loginPath: '/login',
};
expectAssignable<RouteAuthOptions>(routeAuthOptions);

const routeRegistryOptions: RouteRegistryOptions = {
  auth: routeAuthOptions,
  basePath: '/website',
};
expectAssignable<RouteRegistryOptions>(routeRegistryOptions);

const routeRequestOptions: RouteRequestOptions = {
  registry,
  mode: routeMode,
  auth: routeAuthOptions,
  authContext: anonymousAuthContext,
  signal: new AbortController().signal,
};
expectAssignable<RouteRequestOptions>(routeRequestOptions);
expectError<RouteRequestOptions>({ manifest });
expectError<RouteRequestOptions>({ routes: registry.routes });

const routeOptions: RouteOptions<{ id: string }> = {
  auth: requirePermission('users:read'),
  loader: ({ params }) => params.id,
  entries: () => [{ id: '123' }],
  title: 'User',
  namespace: 'users',
};
expectAssignable<RouteOptions<{ id: string }>>(routeOptions);
expectAssignable<AuthRequirement>(requireUser());
const routePolicy: RoutePolicy = () => allow();
expectAssignable<RoutePolicy>(routePolicy);

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
Link({ to: typedUserDestination, children: 'Profile' });
expectError(Link({ to: typedUserRoute, children: 'Profile' }));
expectError(Link({ href: '/about', to: typedUserDestination }));
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

expectError(navigate('/home', { history: 'invalid' }));
expectError(route('/legacy-auth', () => null, { auth: true }));
expectError(route('/legacy-guest', () => null, { auth: 'guest' }));
expectError(route('/legacy-role', () => null, { role: 'admin' }));
expectError(
  route('/legacy-permission', () => null, { permission: 'users:read' })
);
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
  createRouteRegistry(() => {
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
reconcileRouteMeta({
  title: 'Typed metadata',
  html: { lang: 'en', dir: 'ltr' },
});
expectError(
  lazy(async () => ({ default: () => document.createElement('div') }))
);
