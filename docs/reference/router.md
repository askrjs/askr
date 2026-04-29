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

## `route(path, Component, options)`

Registers a route declaration. Call it during route registration.

- `path`: route template using `{name}` for params and `/*` for catch-all
- `Component`: page component function; receives URL params as props
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

## `fallback(Component)`

Registers the root catch-all page for the current top-level route scope.

## `currentRoute()`

Inside a component, call `currentRoute()` to read the current route snapshot.

## `getManifest()`

Returns the normalized route manifest built from registered routes.

## `getRoutes()`

Returns the flat registered route array. Prefer `getManifest()` when route metadata is needed.

## `clearRoutes()`

Clears all route registrations. Used in tests.

## `navigate(path)`

Triggers client-side navigation.

## `Link`

Declarative navigation component.

```tsx
import { Link } from '@askrjs/askr/router';

<Link href="/about">About</Link>;
```

## Types

| Type             | Description                              |
| ---------------- | ---------------------------------------- |
| `RouteComponent` | Page component signature                 |
| `RouteOptions`   | Options accepted by `route()`            |
| `RouteRecord`    | Normalized route record                  |
| `RouteManifest`  | Full route graph                         |
| `RouteSnapshot`  | Read-only snapshot from `currentRoute()` |
