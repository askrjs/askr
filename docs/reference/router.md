# Router API Reference

Import router-specific APIs from `@askrjs/askr/router`.

## `layout(Component, fn)`

Establishes a layout scope. Every `route()` call inside `fn` is automatically wrapped by
`Component` at render time (no per-route manual composition needed).

```ts
import { layout, route } from '@askrjs/askr/router';

layout(AppLayout, () => {
  route('/', HomePage);
  route('/about', AboutPage);
  route('/*', NotFoundPage);
});
```

Layouts may nest — inner scopes add additional wrapper levels.

## `route(path, Component, options?)`

Registers a route declaration. Must be called at module load time (before `createSPA`).

- `path` — route template using `{name}` for params and `/*` for catch-all
- `Component` — page component function; receives URL params as props
- `options` — optional `RouteOptions`:
  - `load` — server data loader `({ params }) => unknown`
  - `entries` — SSG entry generator `() => Array<Record<string, string>>`
  - `guard` — navigation guard `({ params }) => boolean | string`
  - `title` — string title hint for SSG / document meta
  - `namespace` — MFE namespace key

```ts
route('/posts/{slug}', PostPage, {
  load: ({ params }) => fetchPost(params.slug),
  entries: async () => getPosts().map((p) => ({ slug: p.slug })),
  guard: () => isAuthenticated() || '/login',
  title: 'Post',
});
```

Path syntax rules:

- Static segments: `/settings`
- Parameter segments: `/posts/{slug}` — `{name}` only, `:name` is rejected
- Single-segment wildcard: `/files/*`
- Catch-all fallback: `/*`

Specificity order (highest first): **static** › **param** › **wildcard** › **catch-all**.

## `route()` (render-time accessor)

Inside a component, call `route()` with **no arguments** to read the current route snapshot.

```tsx
const snap = route();
// snap.path     — current pathname
// snap.params   — extracted URL params (frozen)
// snap.query    — query string accessor (.get, .getAll, .has, .toJSON)
// snap.hash     — fragment or null
// snap.matches  — all matching routes ordered by specificity
```

The snapshot is deeply frozen and read-only.

## `getManifest()`

Returns the normalized `RouteManifest` built from all `layout()` / `route()` declarations.

```ts
import { getManifest } from '@askrjs/askr/router';
await createSPA({ root: '#app', manifest: getManifest() });
```

## `getRoutes()`

Returns the flat registered route array. Prefer `getManifest()` when route metadata
(load, guard, entries) is needed.

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

| Type                | Description                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| `RouteComponent`    | `(props: Record<string, string>) => unknown` — page component signature |
| `RouteOptions`      | Options accepted by `route()` (load, entries, guard, title, namespace)  |
| `RouteRecord`       | Normalized route record in the manifest                                 |
| `RouteManifest`     | `{ records: RouteRecord[] }` — the full route graph                     |
| `ParsedSegment`     | Typed segment from a path template                                      |
| `LayoutScopeRecord` | A single layout component in the chain                                  |
| `RouteSnapshot`     | Read-only snapshot from `route()` accessor                              |
| `RouteMatch`        | One entry in `RouteSnapshot.matches`                                    |

## Related

- [Router Guide](../guides/router.md)
- [Router Internals](../internals/router-manifest.md)
- [API Overview](api.md)
