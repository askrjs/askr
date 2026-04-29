# Router Internals: Normalized Manifest Model

## Motivation

All routing modes - SPA navigation, SSR request resolution, and SSG page expansion - share the
same fundamental needs: find the best-matching route for a path, extract params, apply layouts,
and expose metadata. Rather than having separate representations for each mode, Askr routes are
compiled into a single normalized `RouteManifest` at **module load time**. Every runtime
consumes this manifest.

## How the manifest is built

Route declarations run as side effects when the routes module is imported:

```ts
// routes.ts
import { layout, route } from '@askrjs/askr/router';

layout(AppLayout, () => {
  route('/posts/{slug}', PostPage, {
    entries: async () => getPosts().map((p) => ({ slug: p.slug })),
  });
  route('/*', NotFound);
});
```

Internally:

1. `layout(Component, fn)` pushes a `LayoutScopeRecord` onto the scope stack and pops it when
   `fn` returns.
2. Each `route(path, Component, options")` call:
   - Validates the path (rejects `:name` syntax, requires `/` prefix)
   - Parses the path into a `ParsedSegment[]` list via `parseSegments()`
   - Computes a deterministic `rank` (specificity score) via `computeRank()`
   - Snapshots the current layout scope stack as the route's `layoutChain`
   - Auto-composes a `RouteHandler` that renders the page inside the layout chain
   - Appends a `RouteRecord` to `records[]` and also registers the handler in the legacy
     `routes[]` store for backward-compatible resolution

## RouteRecord structure

```ts
interface RouteRecord {
  path: string; // e.g. '/posts/{slug}'
  component: RouteComponent; // the page function
  segments: ParsedSegment[]; // [{kind:'static',...}, {kind:'param',...}]
  rank: number; // precomputed specificity score
  layoutChain: LayoutScopeRecord[]; // outermost -> innermost
  options: RouteOptions; // load, entries, guard, title, namespace
  isFallback: boolean; // true only for '/*'
  handler: RouteHandler; // composed render function used by all modes
}
```

## Specificity scoring

| Segment kind       | Points |
| ------------------ | ------ |
| `static` (literal) | 3      |
| `param` (`{name}`) | 2      |
| `wildcard` (`*`)   | 1      |
| `catchall` (`/*`)  | 0      |

Sum of segment scores = route rank. Higher rank wins when multiple routes match a path.

## How each mode consumes the manifest

### SPA navigation

`createSPA({ manifest })` calls `_applyManifest()` which populates the two runtime stores:

- `routes[]` - flat list used by `resolveRoute()` (the depth-indexed O(1) fast path)
- `records[]` - parsed records used by `getManifest()` and future extensions

When `navigate(path)` fires, `resolveRoute()` finds the best `ResolvedRoute.handler`. Because
the handler already has the layout chain baked in, `navigate.ts` does not need to know about
layouts - it just calls the handler.

### SSR request resolution

`renderToString({ url, routes })` calls `resolveRouteFromRoutes()` with the provided flat route
table. Pass manifest-derived routes via:

```ts
routes: getManifest().records.map((r) => ({
  path: r.path,
  handler: r.handler,
  namespace: r.options.namespace,
}));
```

### SSG expansion

The SSG pipeline walks `RouteManifest.records`. Records with `options.entries` are expanded:
`entries()` returns one param map per page. Each map is interpolated into the path template
(`/posts/{slug}` + `{ slug: 'hello' }` -> `/posts/hello`) to produce a concrete `RouteConfig`.

## Invariants

- Route records are always produced in **declaration order** (insertion order within scope).
- Equal-rank routes are resolved by insertion order (first declared wins).
- `clearRoutes()` resets both `routes[]` and `records[]` and unlocks registration.
- Registration is locked after `createSPA` / `hydrateSPA` in production (not in tests).
- The manifest is statically representable: it contains no closures that reference dynamic
  runtime state, making it suitable for serialization and pre-compilation in future tooling.
