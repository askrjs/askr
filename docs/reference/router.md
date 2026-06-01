# Router API Reference

Import router-specific APIs from `@askrjs/askr/router`.

## `registerRoutes(definition, options)`

Runs a callback-based route definition and can attach app-level auth resolution.

```ts
import { registerRoutes } from '@askrjs/askr/router';
import { routeAuth } from './auth';
import { registerAppRoutes } from './routes';

registerRoutes(registerAppRoutes, {
  auth: routeAuth,
});
```

## `group(options, fn)`

Establishes a pathless scope for nested routes. Child routes keep absolute paths,
while `group()` provides inherited layout and access metadata.

Router layouts return normal renderable content. Imperative DOM `Node` values are
not a supported public contract there.

```ts
import { fallback, group, route } from '@askrjs/askr/router';

group({ layout: AppLayout }, () => {
  route('/', HomePage);

  group({ auth: true, layout: WorkspaceLayout }, () => {
    route('/dashboard', DashboardPage);
    route('/settings', SettingsPage);
  });

  fallback(NotFoundPage);
});
```

Supported group options:

- `layout`
- `auth`
- `role`
- `permission`
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
- `role`
- `permission`
- `policies`

Child `route()` declarations inside `page()` must use relative paths.
Nested `page()` declarations are rejected in this release; use `group()` for
inherited behavior inside a page subtree and `route()` for child leaves.

```ts
page('/docs/components', ComponentsPage, () => {
  index(ComponentsOverview);

  group({ auth: true }, () => {
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

Registers a route declaration. Call it during route registration.

- `path`: route template using `{name}` for params and `/*` for catch-all. Inside `page()`, child routes must use relative paths like `tabs`.
- `Component`: page component function; receives URL params as props and returns normal renderable content
- `options`
  - `auth`: `true` for authenticated routes, `"guest"` for signed-out-only routes
  - `role`: role-gated route; implies `auth: true`
  - `permission`: permission-gated route; implies `auth: true`
  - `policies`: ordered access checks
  - `loader`: route loader `({ params }) => unknown`
  - `entries`: SSG entry generator
  - `title`: page title hint
  - `namespace`: namespace key

```ts
route('/posts/{slug}', PostPage, {
  loader: ({ params }) => fetchPost(params.slug),
  entries: async () => getPosts().map((post) => ({ slug: post.slug })),
  auth: true,
  title: 'Post',
});
```

Path syntax rules:

- Static segments: `/settings`
- Parameter segments: `/posts/{slug}`
- Single-segment wildcard: `/files/*`
- Catch-all fallback: `/*`

Specificity order: static > param > wildcard > catch-all.

Auth resolvers, access policies, redirect path resolvers, and role or permission
checks may return native promises or compatible promise-like values. Policy
decisions are awaited in declaration order.

## `fallback(Component)`

Registers a pathful miss route.

- At the root, `fallback()` registers the app-wide catch-all route.
- Inside `page()`, `fallback()` registers a miss route for that page subtree.
- `fallback()` does not scope to `group()` because `group()` is pathless.
- Inside a page subtree, `fallback()` must be declared directly in the `page()` scope.
- Nearest pathful fallback wins.

## `currentRoute()`

Inside a component, call `currentRoute()` to read the current route snapshot.

## `getManifest()`

Returns the normalized route manifest built from registered routes.

## `getRoutes()`

Returns the flat registered route array. Prefer `getManifest()` when route metadata is needed.

## `clearRoutes()`

Clears all route registrations. Used in tests.

## `navigate(path)`

Triggers client-side navigation. When navigation replaces the active route,
Askr disposes route-local component state, resources, tasks, and abort signals
before mounting the replacement. Reconciliation can preserve shared layout DOM
nodes, but state that must survive navigation belongs in a shared layout,
context, or external store.

## `Link`

Declarative navigation component.

```tsx
import { Link } from '@askrjs/askr/router';

<Link href="/about">About</Link>;
```

`Link` accepts normal renderable child content. Imperative DOM `Node` children are not a supported public contract.

## Types

| Type             | Description                              |
| ---------------- | ---------------------------------------- |
| `RouteComponent` | Page component signature                 |
| `RouteOptions`   | Options accepted by `route()`            |
| `RouteRecord`    | Normalized route record                  |
| `RouteManifest`  | Full route graph                         |
| `RouteSnapshot`  | Read-only snapshot from `currentRoute()` |
