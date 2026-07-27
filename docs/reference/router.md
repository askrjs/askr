# Router API Reference

Import router-specific APIs from `@askrjs/askr/router`.

## `createRouteRegistry(definition, options)`

Runs a callback-based route definition and returns an explicit `RouteRegistry`.
Pass that registry to browser boot, SSR, SSG, and testing composition. Its
normalized manifest and route records are implementation data; callers should
not construct or pass those structures separately.

```ts
import { createRouteRegistry } from '@askrjs/askr/router';
import { routeAuth } from './auth';
import { registerAppRoutes } from './routes';

export const registry = createRouteRegistry(registerAppRoutes, {
  auth: routeAuth,
});
```

## `group(options, fn)`

Establishes a pathless scope for nested routes. Child routes keep absolute paths,
while `group()` provides inherited layout and access metadata.

Router layouts return normal renderable content. Imperative DOM `Node` values are
not a supported public contract there.

```ts
import { requireUser } from '@askrjs/auth';
import { fallback, group, route } from '@askrjs/askr/router';

group({ layout: AppLayout }, () => {
  route('/', HomePage);

  group({ auth: requireUser(), layout: WorkspaceLayout }, () => {
    route('/dashboard', DashboardPage);
    route('/settings', SettingsPage);
  });

  fallback(NotFoundPage);
});
```

Supported group options:

- `layout`
- `auth`
- `policies`

## `page(path, Component, fn)`

Registers a renderable route shell for a set of routed child leaves.

- `path`: absolute base path for the page scope
- `Component`: page host component; receives URL params as props
- `fn`: child route definition callback

Use `Outlet()` inside the page host to render the active child route.

`page()` is pathful and renderable. Use `group()` when you only need inherited
behavior such as `layout`, `auth`, or `policies` without creating a route
segment.

```tsx
import { index, Outlet, page, route } from '@askrjs/askr/router';

function ComponentsPage() {
  return (
    <section>
      <h1>Components</h1>
      <Outlet />
    </section>
  );
}

page('/docs/components', ComponentsPage, () => {
  index(ComponentsOverview);
  route('tabs', ComponentsTabs);
  route('pills', ComponentsPills);
});
```

`index()` creates the concrete default child route at the page pathname. The
page host provides shell structure; it is not itself the default leaf.

Supported page options:

- `auth`
- `policies`

Child `route()` declarations inside `page()` must use relative paths.
Nested `page()` declarations are rejected in this release; use `group()` for
inherited behavior inside a page subtree and `route()` for child leaves.

```ts
page('/docs/components', ComponentsPage, () => {
  index(ComponentsOverview);

  group({ auth: requireUser() }, () => {
    route('tokens', ComponentsTokensPage);
    route('patterns', ComponentsPatternsPage);
  });
});
```

In this example, the child leaves still live under `/docs/components/...`; the
group only adds inherited behavior.

```ts
page('/docs/components', ComponentsPage, () => {
  index(ComponentsOverview);
  route('tabs', ComponentsTabs); // /docs/components/tabs
  route('/tabs', ComponentsTabs); // rejected
});
```

## `index(Component, options)`

Registers the default child route for the current `page()` scope.

## `Outlet()`

Renders the active child route inside the current `page()` host.

## `route(path, Component, options)`

Registers a route declaration, returns a typed `RouteRef`, and must be called
during route registration.

- `path`: route template using `{name}` for params and `/*` for catch-all. Inside `page()`, child routes must use relative paths like `tabs`.
- `Component`: page component function; receives URL params as props and returns normal renderable content
- `options`
  - `auth`: an `AuthRequirement` such as `requireUser()` or `requireRole('admin')`
  - `policies`: ordered access checks
  - `loader`: route loader `({ params }) => unknown`
  - `preload`: query prefetch work for SSR and hydration
  - `entries`: SSG entry generator
  - `search`: executable schema used by typed destinations
  - `meta`: title, meta, canonical/link, JSON-LD, language, and direction metadata
  - `actions`: browser-safe action descriptors authorized for this matched page
  - `namespace`: namespace key

```ts
route('/posts/{slug}', PostPage, {
  loader: ({ params }) => fetchPost(params.slug),
  entries: async () => getPosts().map((post) => ({ slug: post.slug })),
  auth: requireUser(),
  search: PostSearch,
  meta: { title: 'Post' },
  actions: [updatePostAction],
});
```

Group, page, and leaf metadata compose in declaration order. The deepest scalar
value wins; Open Graph maps merge, while link and JSON-LD entries append in a
deterministic order.

## `to(ref, params, search)`

Builds an immutable typed destination. Missing path params throw, and a
route's executable search schema rejects invalid values before navigation.

```tsx
const postRoute = route('/posts/{slug}', PostPage, { search: PostSearch });
const destination = to(postRoute, { slug: 'release' }, { view: 'summary' });
<Link to={destination}>Release post</Link>;
```

`Link href="..."` remains available for a raw destination.

## `routeData()`, `defer()`, and `Resolve`

`routeData<T>()` reads loader output while the matched route renders. Critical
loader work is awaited. Wrap only non-critical promises in `defer()` and render
them through `Resolve`, which owns pending, fulfilled, and rejected output.

```tsx
const reportRoute = route('/report', ReportPage, {
  loader: () => ({ summary: defer(loadSummary()) }),
});

function ReportPage() {
  const data = routeData<{ summary: ReturnType<typeof defer<Summary>> }>();
  return (
    <Resolve
      value={data.summary}
      pending={<p>Loading…</p>}
      rejected={<p>Failed.</p>}
    >
      {(summary) => <SummaryView summary={summary} />}
    </Resolve>
  );
}
```

Path syntax rules:

- Static segments: `/settings`
- Parameter segments: `/posts/{slug}`
- Single-segment wildcard: `/files/*`
- Catch-all fallback: `/*`

Specificity order: static > param > wildcard > catch-all.

Auth requirements, auth resolvers, access policies, and redirect path resolvers
may return native promises or compatible promise-like values. Decisions are
awaited in declaration order.

## `fallback(Component)`

Registers a pathful miss route.

- At the root, `fallback()` registers the app-wide catch-all route.
- Inside `page()`, `fallback()` registers a miss route for that page subtree.
- `fallback()` does not scope to `group()` because `group()` is pathless.
- Inside a page subtree, `fallback()` must be declared directly in the `page()` scope.
- Nearest pathful fallback wins.

## `currentRoute()`

Inside a component, call `currentRoute()` to read the current route snapshot.

## `navigate(path)`

Triggers client-side navigation. When navigation replaces the active route,
Askr disposes route-local component state, resources, tasks, and abort signals
before mounting the replacement. Reconciliation can preserve shared layout DOM
nodes, but state that must survive navigation belongs in a shared layout,
context, or external store.

## `updateRouteQuery(updates, options)`

Updates the current URL query string without resolving or remounting the route.
Use it for route-local view state such as search, filters, tabs, and pagination.
The default history mode is `replace`, so high-frequency controls do not create
one Back-button entry per keystroke.

```ts
import { updateRouteQuery } from '@askrjs/askr/router';

updateRouteQuery({ q: 'northwind' });
updateRouteQuery({ q: null, tags: ['ops', 'billing'] }, { history: 'push' });
updateRouteQuery((searchParams) => searchParams.set('page', '2'));
```

`null` and `undefined` delete a query key. Array values append repeated query
keys in order.

## `Link`

Declarative navigation component.

```tsx
import { Link } from '@askrjs/askr/router';

<Link href="/about">About</Link>;
```

`Link` accepts normal renderable child content. Imperative DOM `Node` children are not a supported public contract.

Raw `href` values may be relative URLs or use `http`, `https`, `mailto`,
`sms`, or `tel`. `Link` rejects other explicit schemes, including executable
and local-file URLs.

For styled navigation with automatic active-route state, install the optional
`@askrjs/themes` package and use `NavLink` from
`@askrjs/themes/components`:

```tsx
import { NavLink } from '@askrjs/themes/components';

<NavLink href="/settings">Settings</NavLink>;
```

## Types

| Type               | Description                                         |
| ------------------ | --------------------------------------------------- |
| `RouteComponent`   | Page component signature                            |
| `RouteOptions`     | Options accepted by `route()`                       |
| `RouteRecord`      | Normalized route record                             |
| `RouteManifest`    | Full route graph                                    |
| `RouteSnapshot`    | Read-only snapshot from `currentRoute()`            |
| `RouteRef`         | Typed path/search declaration returned by `route()` |
| `RouteDestination` | Immutable destination returned by `to()`            |
| `RouteMeta`        | Normalized document metadata contract               |
