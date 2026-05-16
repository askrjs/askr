# Router Guide

The Askr router is built around one mental model:

- `route()` defines leaves
- `group()` defines inherited behavior
- `page()` defines a renderable route shell with nested child routes
- `index()` defines the default child leaf inside that shell
- `registerRoutes()` runs the composed route tree

The same route definitions drive SPA navigation, SSR request resolution, and SSG.

## Register routes and boot

```ts
// routes.ts
import { group, route, fallback } from '@askrjs/askr/router';
import AppLayout from './app';
import Home from './pages/home';
import About from './pages/about';
import PostPage from './pages/post';
import NotFound from './pages/not-found';

export function registerAppRoutes() {
  group({ layout: AppLayout }, () => {
    route('/', Home);
    route('/about', About);
    route('/posts/{slug}', PostPage, {
      entries: async () => getPosts().map((post) => ({ slug: post.slug })),
      title: 'Post',
    });
    fallback(NotFound);
  });
}
```

```ts
// main.ts
import { createSPA } from '@askrjs/askr/boot';
import { getManifest, registerRoutes } from '@askrjs/askr/router';
import { registerAppRoutes } from './routes';

registerRoutes(registerAppRoutes);
await createSPA({ root: '#app', manifest: getManifest() });
```

## Group inheritance

`group(options, fn)` is a pathless behavioral scope. Child routes keep absolute
paths and inherit layout and access metadata.

```ts
group({ layout: RootLayout }, () => {
  route('/', HomePage);

  group({ auth: true }, () => {
    route('/dashboard', DashboardPage);

    group({ role: 'admin', layout: AdminShell }, () => {
      route('/admin/users', AdminUsersPage);
      route('/admin/settings', AdminSettingsPage);
    });
  });

  fallback(NotFoundPage);
});
```

## Partial pages

Use `page()` when sibling routes should share one page shell without repeating
the same framing component on every leaf.

A `page()` is different from a layout group:

- `group()` does not create a route segment.
- `page()` creates a route segment and renders a shell.
- `Outlet()` renders the matched child route.
- `index()` renders when the page pathname matches exactly.
- Inherited `layout` wrappers still apply around matched page and route content.

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

The page shell is not itself the default leaf. `index()` registers the concrete
child route that renders at the page pathname.

Notes:

- `page()` is additive; existing `group()` and absolute `route()` authoring still works.
- `group()` is behavioral and pathless; `page()` is pathful and renderable.
- Child `route()` calls inside a `page()` must be relative.
- `page()` cannot be nested inside another `page()` in this release.
- `index()` registers the default child at the page's own pathname.
- `Outlet()` renders the active child route inside the shared page shell.
- `route('tabs', Tabs)` becomes `/docs/components/tabs` inside `page('/docs/components', ...)`.
- `route('/tabs', Tabs)` is rejected inside `page()`.

If you need shared behavior under a page subtree, use `group()` inside the page
scope. If you need another leaf, use `route()`.

For example, keep the page shell at `/docs/components`, then scope shared
behavior for a subset of child leaves with `group()`:

```ts
page('/docs/components', ComponentsPage, () => {
  index(ComponentsOverview);

  group({ auth: true }, () => {
    route('tokens', ComponentsTokensPage);
    route('patterns', ComponentsPatternsPage);
  });
});
```

The page shell still owns `/docs/components`. The grouped child leaves inherit
the shared behavior, and their paths remain `/docs/components/tokens` and
`/docs/components/patterns`.

## Fallback scope

`fallback()` is pathful, not behavioral.

- At the root, it registers the app-wide catch-all miss route.
- Inside `page()`, it registers a page-local miss route for that page subtree.
- It does not scope to the nearest `group()` because `group()` is pathless.
- Inside a page subtree, `fallback()` must be declared directly in the `page()` scope.
- Nearest pathful fallback wins.

```ts
page('/docs/components', ComponentsPage, () => {
  index(ComponentsOverview);
  fallback(ComponentsNotFoundPage);
});

fallback(AppNotFoundPage);
```

In this example:

- `/docs/components/unknown` renders `ComponentsPage` with `ComponentsNotFoundPage` in its `Outlet()`.
- `/somewhere-else` renders `AppNotFoundPage`.
- `group()` can still wrap either fallback with inherited layout or access behavior, but it does not define fallback scope by itself.

## Common access metadata

Use route metadata for the common case:

```ts
route('/login', LoginPage, { auth: 'guest' });
route('/dashboard', DashboardPage, { auth: true });
route('/admin', AdminPage, { role: 'admin' });
route('/billing', BillingPage, { permission: 'billing:read' });
```

Use `policies` only for advanced access checks:

```ts
route('/settings', SettingsPage, {
  auth: true,
  policies: [requireVerifiedEmail()],
});
```

## Read the current route

Inside a component, call `currentRoute()`:

```tsx
import { currentRoute } from '@askrjs/askr/router';

function PostPage() {
  const snap = currentRoute();
  return <article>{snap.params.slug}</article>;
}
```

`currentRoute()` is the route snapshot API inside components.

## Route options

```ts
route('/posts/{slug}', PostPage, {
  auth: true,
  loader: ({ params }) => fetchPost(params.slug),
  entries: async () => getPosts().map((post) => ({ slug: post.slug })),
  title: 'Post',
});
```

Notes:

- `loader` is the canonical name
- guest routes are prerenderable in SSG
- authenticated or policy-controlled routes are skipped as runtime-only in SSG by default

## Path syntax

- Static: `/settings`
- Param: `/posts/{slug}`
- Wildcard: `/files/*`
- Catch-all: `/*`

Always use `{name}` for params. `:name` is rejected.

## Next

- [Router API](../reference/router.md)
- [Router Internals](../internals/router-manifest.md)
