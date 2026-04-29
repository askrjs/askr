# Router API Reference

Import router-specific APIs from `@askrjs/askr/router`.

## `registerRoutes(definition, options")`

Runs a callback-based route definition and optionally attaches app-level auth resolution.

```ts
import { registerRoutes } from '@askrjs/askr/router';
import { routeAuth } from './auth';
import { registerAppRoutes } from './routes';

registerRoutes(registerAppRoutes, {
  auth: routeAuth,
});
```

`registerRoutes()` is the canonical place to supply `auth.resolve` for built-in
`auth`, `role`, and `permission` route metadata.

## `group(options, fn)`

Establishes a pathless behavioral scope. Child routes keep absolute paths, while
`group()` provides inherited layout and access metadata.

```ts
import { group, route, fallback } from '@askrjs/askr/router';

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

## `route(path, Component, options")`

Registers a route declaration. Must be called during route registration.

- `path`: route template using `{name}` for params and `/*` for catch-all
- `Component`: page component function; receives URL params as props
- `options`
  - `auth`: `true` for authenticated routes, `"guest"` for signed-out-only routes
  - `role`: role-gated route; implies `auth: true`
  - `permission`: permission-gated route; implies `auth: true`
  - `policies`: ordered advanced access checks
  - `loader`: canonical route loader `({ params }) => unknown`
  - `entries`: SSG entry generator
  - `title`: page title hint
  - `namespace`: MFE namespace key

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

Specificity order (highest first): static > param > wildcard > catch-all.

## `fallback(Component)`

Registers the root catch-all page for the current top-level route scope.

```ts
fallback(NotFoundPage);
```

## `currentRoute()`

Inside a component, call `currentRoute()` to read the current route snapshot.

```tsx
const snap = currentRoute();
// snap.path
// snap.params
// snap.query
// snap.hash
// snap.matches
```

The snapshot is deeply frozen and read-only.

## `getManifest()`

Returns the normalized `RouteManifest` built from registered routes.

```ts
import { getManifest } from '@askrjs/askr/router';
await createSPA({ root: '#app', manifest: getManifest() });
```

## `getRoutes()`

Returns the flat registered route array. Prefer `getManifest()` when route metadata
is needed.

## `clearRoutes()`

Clears all route registrations. Used in tests.

## `navigate(path)`

Triggers client-side navigation.

## `Link`

Declarative navigation component.

```tsx
<Link href="/about">About</Link>
```

## Types

| Type             | Description                                                           |
| ---------------- | --------------------------------------------------------------------- |
| `RouteComponent` | `(props: Record<string, string>) => unknown` page component signature |
| `RouteOptions`   | Options accepted by `route()`                                         |
| `RouteRecord`    | Normalized route record in the manifest                               |
| `RouteManifest`  | `{ records: RouteRecord[] }` full route graph                         |
| `RouteSnapshot`  | Read-only snapshot from `currentRoute()`                              |

## Related

- [Router Guide](../guides/router.md)
- [Router Internals](../internals/router-manifest.md)
- [API Overview](api.md)
