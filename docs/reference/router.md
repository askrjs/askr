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
- `meta`, `appMeta`
- `error`, `forbidden` (see [Route error and forbidden components](#route-error-and-forbidden-components))
- `loader`, `staleTimeMs` (see [Group and page loaders](#group-and-page-loaders))

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
- `meta`, `appMeta`
- `preload`
- `error`, `forbidden`
- `loader`, `staleTimeMs` (see [Group and page loaders](#group-and-page-loaders))

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

### Canonical paths: `trailingSlash` and `caseSensitive`

`createRouteRegistry(definition, options)` also accepts two options that
make one URL per page canonical:

- `trailingSlash`: `'ignore'` (default) matches `/about` and `/about/`.
  `'never'` redirects `/about/` to `/about`; `'always'` redirects `/about` to
  `/about/`. The root `/` and file-like last segments (`/files/report.pdf`) are
  never changed, and a path no route matches is left to `fallback()`.
- `caseSensitive`: `true` (default) matches static segments exactly. With
  `false`, `/About` and `/USERS/Ada` redirect to the declared case
  (`/about`, `/users/Ada`); parameter values keep the case the URL gave them.

```tsx
const registry = createRouteRegistry(routes, {
  trailingSlash: 'never',
  caseSensitive: false,
});
```

The redirect is a 308 that keeps the query string and fragment. Server
rendering returns it as a `{ kind: 'redirect', status: 308 }` result for the
host to send; the browser follows it through the router (a client navigation
pushes the canonical URL, so Back returns to the page it started from) and
replaces the entry when it happens while booting. Both options apply to route
resolution, so `matchRoute()`, activity helpers such as `isRoutePathActive()`
and SSG output paths keep their existing, case-sensitive exact matching:
link and generate the canonical form.

### Applications mounted below the origin root

Set one logical-to-public pathname boundary on the registry:

```tsx
const registry = createRouteRegistry(
  () => {
    route('/', HomePage);
    route('/reviews/{slug}', ReviewPage);
  },
  { basePath: '/website' }
);
```

Route declarations, loader and metadata contexts, `currentRoute()`, activity
checks, and SSG output paths remain logical (`/reviews/book`). Browser and SSR
matching remove `/website` first; typed destinations, `<Link>`, `navigate()`,
guard/auth redirects, popstate, and query updates use the public mounted URL
(`/website/reviews/book`). String targets passed to `navigate()`, `<Link href>`,
`redirect()`, `loginPath` and `authenticatedRedirectTo` are always logical, so
a root-relative path always gains the base: under `/website`,
`navigate('/website/news')` goes to `/website/website/news`. Development builds
warn when a string equals the base or starts with it followed by `/`. Typed
destinations from `to()` already carry the public URL, and all of these APIs
accept them without prefixing again. A redirect decision built from a
destination (`redirect(to(route, params))`) records its public href under an
own enumerable symbol key, so a spread copy such as
`{ ...redirect(to(route, params)), status: 303 }` keeps it. The key shows up
in `toEqual()` comparisons and `util.inspect()` output. `structuredClone()`
and `JSON` drop it, and so does replacing `to`; the decision then counts as
logical again and gains the base. To leave the mount for another app on the
same origin, pass an absolute URL such as
`` `${location.origin}/marketing` ``. The same registry must be used for server rendering
and hydration. Use `basePath: ''` or omit it for an origin-root deployment.
Vite's `base` remains responsible for JavaScript, CSS, and other asset URLs.

- `path`: route template using `{name}` for params and `/*` for catch-all. Inside `page()`, child routes must use relative paths like `tabs`.
- `Component`: page component function; receives URL params as props and returns normal renderable content
- `options`
  - `auth`: an `AuthRequirement` such as `requireUser()` or `requireRole('admin')`
  - `policies`: ordered access checks
  - `loader`: route loader `({ params }) => unknown`
  - `dehydrate`: synchronous selector for the loader data embedded in initial hydration
  - `preload`: query prefetch work for SSR and hydration; it runs alongside the loader and lazy chunk
  - `entries`: SSG entry generator
  - `search`: executable schema used by typed destinations and to parse the inbound query string (see [Inbound search params](#inbound-search-params))
  - `meta`: title, meta, canonical/link, JSON-LD, language, and direction metadata
  - `appMeta`: immutable application declaration data, separate from document metadata
  - `actions`: browser-safe action descriptors authorized for this matched page
  - `namespace`: namespace key
  - `error`: component rendered when the route fails to resolve (see below)
  - `forbidden`: component rendered when the route is denied (see below)

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

`loader` data has two consumers during SSR and SSG: the server component and
the browser hydration envelope. By default both receive the same value. Use
`dehydrate(data, context)` when the server needs fields that the hydrated page
does not:

```tsx
route('/account/{id}', AccountPage, {
  loader: ({ params }) => loadAccountViewModel(params.id),
  dehydrate: (data) => ({
    account: data.account,
    permissions: data.permissions,
  }),
});
```

### Resolution order

After auth and policies allow a route, its lazy components, `preload` and
`loader` start together and the route renders when the slowest settles, so
latency is the maximum of the three rather than their sum. A `loader` that
needs data a `preload` prefetches must read it through its own query, not rely
on the preload having finished. `meta` runs after the loader and chunk have
settled: its context carries the loader result as `context.data`, and the
sources of a `group()`/`page()`/route chain are started together and merged in
declaration order.

```tsx
route('/users/{id}', UserPage, {
  loader: ({ params }) => fetchUser(params.id),
  meta: ({ data }) => ({ title: data?.name ?? 'User' }),
});
```

`data` is absent when the route has no loader, in SSG, or when a caller of
`resolveRouteMeta()` passes none; pass `{ ...context, data }` to supply it.
A navigation that is superseded while any source is pending publishes nothing.

The selector runs synchronously after the loader and receives typed loader data
plus the concrete route context. SSR/SSG components still see the complete
loader result. Only its return value crosses the HTML transport boundary.
Initial hydration reads the selected value; reading a branch intentionally
omitted by the selector throws with the route and property path. A later client
navigation reruns the loader and exposes the complete result.

### Code-split route content

`lazy(() => import('./page'))` wraps a dynamic import as a route component. The
import starts when the route first matches, and the returned component's
`preload()` fetches it earlier, for example on hover.

Use `lazyRouteData()` when a content-heavy route should keep only navigation
and SEO metadata in the route manifest. Its dynamic import starts only after
that route matches; the imported module is cached and the same loader runs
during SPA navigation, SSR, and SSG:

```tsx
import { lazyRouteData, route, routeData } from '@askrjs/askr/router';

const loadMidgeDocs = lazyRouteData(
  () => import('./docs-content/midge'),
  (module, { params }) => ({
    page: module.pages[params.page],
    navigation: module.navigation,
  })
);

route('/docs/midge/{page}', DocsPage, {
  loader: loadMidgeDocs,
  entries: () =>
    docsManifest.midge.pages.map(({ slug }: { slug: string }) => ({
      page: slug,
    })),
  meta: {
    title: 'Midge documentation',
    description: 'Small static metadata remains in the route manifest.',
  },
  dehydrate: (data) => ({ page: data.page }),
});

function DocsPage() {
  const content = routeData<{ page: { title: string; body: string } }>();
  return <article>{content.page.body}</article>;
}
```

Successful lazy component and route-data imports stay cached. If an import
fails, Askr clears that failed attempt so the next route match or explicit
`preload()` call retries the factory instead of replaying a stale rejection.

`loadMidgeDocs.preload()` is available for an explicit hover or intent
preload. Loader failures retain the original `cause` and report the concrete
route plus `client`, `server`, or `ssg` phase. Hydration transport validation
continues to identify the route and property path; use `dehydrate()` so
unrelated catalog content never enters the browser payload.

A chunk that fails to load during navigation rejects the route resolution (it
no longer surfaces later, while rendering), so the route's `error` component
renders it, or the failure is logged when none is declared. When the failure
looks like a deployment that replaced its chunk files (a `ChunkLoadError`, or
the `TypeError` browsers throw for a dynamic `import()` that cannot load its
module), Askr also loads the destination as a fresh document, once per browser
session: a `sessionStorage` marker (`askr:stale-deployment-reload`) stops a
document that fails the same way from reloading in a loop, and is cleared when
a chunk loads. Without `sessionStorage` nothing reloads.

Group, page, and leaf metadata compose in declaration order. The deepest scalar
value wins; Open Graph maps merge, while link and JSON-LD entries merge as
described under [Route metadata helpers](#route-metadata-helpers).

## `to(ref, params, search)`

Builds an immutable typed destination. Missing path params throw, and a
route's executable search schema rejects invalid values before navigation.
Destinations declared inside a registry with `basePath` include that public
prefix.

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

Hydration transport accepts `null`, strings, booleans, finite numbers, dense
arrays, plain objects, and Askr `defer()` values. It rejects `undefined`,
functions, symbols, bigint, non-finite numbers, accessors, class instances,
`Date`, `Map`, `Set`, sparse arrays, and cycles before a page is published. The
error identifies the concrete route and property path. Convert richer domain
objects to transport objects in `dehydrate`; omit credentials, tokens, private
records, and server-only helpers there rather than relying on `JSON.stringify`
to drop them.

A rejected `defer()` value crosses to the client with a generic reason
(`"Deferred value rejected."`), not the server error's message, so connection
strings and other server detail never reach the page. The server-side
`rejected` render still receives the original error. To send a message the
user should see, reject with an `Error` that sets `expose: true`:

```ts
throw Object.assign(new Error('Report is still generating.'), { expose: true });
```

If `rejected` renders the error text, only exposed errors hydrate with the same
text the server rendered.

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

A parameter or `*` wildcard needs one non-empty segment: `/users//x` does
not match `/users/{id}/x`, and `/users//` matches neither `/users/{id}` nor
`/users`. One trailing slash is ignored (`/users/` matches `/users`). A splat
may capture an empty remainder (`/files/` matches `/files/{*path}` with
`path: ''`).

Specificity order: static > param > wildcard > named splat > catch-all,
compared segment by segment: the first segment where two routes differ decides.
For `/docs/intro`, `/docs/{*rest}` beats `/{lang}/{page}` because its first
segment is static.

Two routes that match exactly the same URLs are rejected when they are
registered, because the later one could never be reached. Parameter and splat
names, a trailing slash, and percent-encoding of static segments do not make
routes distinct, and a `*` wildcard matches one segment exactly like a param
(which always beats it). So `/users/{id}` and `/users/{userId}`, `/users/{id}`
and `/users/*`, `/café` and
`/caf%C3%A9`, or a page `index()` and a `route()` at the page path, throw
`Duplicate route path "...": it matches the same URLs as "...", which is
already registered.` A `fallback()` counts as a named splat at its prefix, so
it conflicts with `route('/*')` at the root or `route('/users/{*rest}')` inside
`page('/users')`. Each registry is checked separately. When both paths are
the same template, declare it once and return each page's params from
`entries()`.

Askr matches percent-decoded paths. Static segments, `fallback()` prefixes and
registry `basePath` values compare against the decoded URL, so
`route('/café', ...)` and `route('/a b', ...)` match `/caf%C3%A9` and `/a%20b`.
Non-canonical encodings match too: `/%61dmin` matches `route('/admin', ...)`. If
a proxy, CDN or edge function applies path-based access control in front of
Askr, it must percent-decode paths the same way before comparing them, or an
encoded request can reach a route its rules meant to block.

Captures are decoded segment by segment: params, named splats, and the `*`
capture of wildcards, catch-alls and fallbacks (`/files/*` on
`/files/caf%C3%A9` gives `{ '*': 'café' }`). Encoded separators stay encoded:
`%2F` and `%5C` are kept as upper-case `%2F`/`%5C` inside a capture, so
`/files/..%2F..%2Fetc` captures `..%2F..%2Fetc`, never `../../etc`, and a
capture never gains a `/` the URL did not have. `to()` passes kept `%2F`/`%5C`
through unchanged, so a capture builds back the URL it came from. Malformed
percent encodings are compared and captured as written.

Auth requirements, auth resolvers, access policies, and redirect path resolvers
may return native promises or compatible promise-like values. Decisions are
awaited in declaration order. During client navigation, an auth result that
settles after its request was aborted by a newer navigation is discarded, so
`currentAuth()` continues to describe the navigation that actually committed.
During server rendering it reads only the request render context, including
deferred streaming boundaries. That context is request-scoped through
`AsyncLocalStorage`, so concurrent requests cannot replace it; on a runtime
without `AsyncLocalStorage`, Askr accepts only synchronous server renders and
rejects async ones instead of sharing a context between requests (see
[SSR](../guides/ssr.md)). A
server render without request auth, such as `renderToString(Component)`, sees
an anonymous identity; server-side route resolution never updates the
browser-wide identity.

## Access decisions

Route policies return access decisions. A policy is `(context) => AccessDecision | PromiseLike<AccessDecision>` passed
in a route's `policies` array.

- `allow()` lets the request continue.
- `redirect(to, init?)` sends the visitor elsewhere. A string is a logical path
  that gains the registry `basePath`; a `to()` destination is used as-is.
  `init` sets `status` and `replace`.
- `deny(status)` stops the request with a 401, 403, or 404 status.
  `unauthorized()`, `forbidden()`, and `notFound()` are shorthands for
  `deny(401)`, `deny(403)`, and `deny(404)`.

### Inbound search params

A route that declares `search: schema` has its query string parsed with that
schema every time the route resolves, so loaders, `preload`, `meta`, policies
and components receive typed values instead of raw strings:

```tsx
import { schema, type InferSchema } from '@askrjs/schema';

const ListSearch = schema.object({
  page: schema.integer({ minimum: 1, default: 1 }),
  sort: schema.enum(['asc', 'desc'], { default: 'asc' }),
  q: schema.optional(schema.string()),
});

route('/posts', PostsPage, {
  search: ListSearch,
  loader: ({ searchParams }) =>
    fetchPosts(searchParams.page, searchParams.sort),
});

function PostsPage() {
  const { search } = currentRoute<
    RouteParams,
    unknown,
    unknown,
    InferSchema<typeof ListSearch>
  >();
  return <p>Page {search.page}</p>;
}
```

- `context.searchParams` is the parsed object in `loader`, `preload`, `meta` and
  policies (`context.search` remains the raw query string). It is `{}` for a
  route without a schema. `currentRoute().search` is the same object, typed by
  the fourth `currentRoute()` generic.
- Query strings carry text, so values are converted to the type the schema
  declares first: numbers and integers, booleans (`true`/`false`), `null`,
  enum and literal members, and repeated keys for arrays.
- The query string never fails resolution and never produces a 404. A value
  that fails validation takes the property's schema `default`, or is dropped when
  it has none; a missing property takes its `default`. Keys the schema does not
  declare are ignored. A required property with neither a value nor a default
  stays absent.
- Outbound `to()` still validates and serializes with the same schema.

### Loader cache

In the browser, loader results live in the application's data runtime
(`dataRuntime` of `createSPA()`/`hydrateSPA()`, else the default one), keyed by
route template, params and search. Visiting a URL again, including back and
forward traversal, renders the cached result immediately and revalidates it in
the background; when the new result arrives, the route re-renders in place with
it. Concurrent navigations to one key share a single request, which is
cancelled only when every navigation waiting on it has gone.

- `staleTimeMs` (route, `group()` or `page()` option; default `0`): how long a
  cached result counts as fresh. A fresh result renders with no request. `0`
  and `'always'` revalidate on every visit while still rendering the cached
  result first.
- A failed revalidation keeps the cached result and logs a warning; the next
  visit tries again. A failed first load behaves as before (see error
  components).
- Entries are dropped by the existing invalidation API. Keys begin with
  `route-data:` followed by the route template, so
  `invalidate('route-data:/posts/{slug}')` clears every cached post and
  `invalidate('route-data:')` clears all route data. Invalidating also stops
  an in-flight request from storing its result. Call it after a mutation that
  changes what a loader returns.
- Up to 100 entries are kept per runtime, least recently used first.
- `navigationState().revalidating` is true while a background revalidation is
  in flight (see the [navigation guide](../guides/navigation.md)).
- Server rendering and SSG never read or write the cache.

### Group and page loaders

`group()` and `page()` accept `loader` (and `staleTimeMs`). Ancestor loaders run
in parallel with the leaf's loader, lazy chunk and `preload`, share the leaf's
cache behavior, and their results are read with `layoutData(loader)` from
layouts, page hosts or the leaf, typed by the loader function itself:

```tsx
const loadUser = ({ signal }: RouteContext) => fetchUser(signal);

group(
  {
    loader: loadUser,
    layout: ({ children }) => (
      <div>
        <Header user={layoutData(loadUser)} />
        {children}
      </div>
    ),
  },
  () => {
    route('/inbox', InboxPage, { loader: loadInbox });
  }
);
```

`routeData()` stays the leaf's own loader data. `layoutData()` must run while
rendering a route whose chain declares that loader, and the value must be
JSON-compatible for server rendering, which transports it with the page.
`renderRouteRequest()` and `hydrateSPA()` support group/page loaders;
`renderToString()` rejects them like leaf loaders, and SSG does not run them.

## Route error and forbidden components

`route()`, `page()` and `group()` accept two component options. The nearest
declaring scope wins (a `route()` over its `page()`, a `page()` over its
`group()`); `fallback()` keeps owning not-found.

- `error`: `({ error, retry }) => content`. In the browser, when a navigation
  to the route fails because its lazy chunk, `preload`, `loader` or a policy
  throws, the navigation still commits to the destination URL and the error
  component renders in place of the route content (page hosts and layouts stay).
  `error` is what was thrown. `retry()` resolves the current location again,
  replacing its history entry. Abort errors from superseded navigations never
  reach it, and session-auth recovery redirects take precedence.
- `forbidden`: `({ status }) => content`. When a policy or auth requirement
  denies the route (`deny()`, `unauthorized()`, `forbidden()`, `notFound()`, a
  `403` from `auth`), this component renders instead of the bare
  `<div data-route-denied="403">` placeholder, without the route's layouts.

```tsx
group(
  {
    error: ({ error, retry }) => (
      <section role="alert">
        <p>Something went wrong.</p>
        <button type="button" onClick={retry}>
          Try again
        </button>
      </section>
    ),
    forbidden: ({ status }) => <p>Not allowed ({status}).</p>,
  },
  () => {
    route('/reports/{id}', ReportPage, { loader: loadReport });
  }
);
```

With no `error` declared, a failed navigation keeps today's behavior: the
failure is logged and the current page and URL stay. With no `forbidden`
declared, the status placeholder renders. A route that fails while it is the
initial route of `createSPA()` renders its `error` component the same way.
Route metadata is not resolved for an error rendering.

### Server rendering

`renderRouteRequest()` and `renderRouteRequestToString()` render the same
components when the matched route (or an ancestor `page()`/`group()`) declares
them:

- A loader, `preload`, policy or render failure renders the `error` component
  inside the route's layouts and resolves to `{ kind: 'render', html, status:
  500, error }`, where `error` is the original failure. Send `status` with the
  HTML and log `error`. The component's `retry()` is inert on the server.
- A denial renders the `forbidden` component (without layouts, as in the
  browser) and resolves to `{ kind: 'render', html, status, denied: true }`
  where `status` is the denial status (`401`, `403` or `404`). `denied` is an
  ordinary enumerable field, so it survives spreading and serialization.
- Without the component the results are unchanged: the call rejects with the
  failure and returns `{ kind: 'deny', status }` for denials.

Server-rendered pages show visitors only what a failure opts in to expose,
as rejected deferred values do: the `error` prop of a server-rendered page is
the failure itself when it is an `Error` with `expose: true`, and otherwise an
`Error` whose message is `"Route failed to render."`. The browser rebuilds the
same error from the page's hydration data, so `hydrateSPA()` adopts the markup
without a mismatch and the loader does not run again. A denial is
re-evaluated by the client with the same policies, so it renders the same
`forbidden` component.

## `RouteDataLoadError`

A loader created with `lazyRouteData()` rejects with a `RouteDataLoadError`
when its import or `select` step fails. Its `preload()` rejects with the raw
import error instead. Its `route` is the requested URL,
`phase` is where the loader ran (`'client'`, `'server'`, or `'ssg'`), and
`cause` is the original error. Abort errors pass through unwrapped.

## Deferred value helpers

- `isDeferred(value)` checks whether a value came from `defer()`.
- `resolveDeferredValues(input, signal?)` waits for every `defer()` value
  reachable through arrays and object property values (not `Map` or `Set`
  contents) and resolves to the same `input` object. It rejects as soon as any
  deferred value rejects, or with an `AbortError` once `signal` is aborted and
  a `defer()` value is reached. The `defer()` wrappers stay
  in place, now settled, so render them with `Resolve` rather than serializing
  `input` directly.

## Route metadata helpers

When `group()`, `page()` and `route()` metadata merge, scalar fields take the
most specific value, `openGraph` and `html` merge key by key, `links` are
identified by `rel` and `href` (a link declared again replaces the earlier one
in place) and identical `jsonLd` values are written once.

Most applications let the router manage the document head. Custom shells can
use the same helpers:

- `resolveRouteMeta(record, context)` runs a route's metadata chain and resolves
  to the merged `RouteMeta`; `await` it before serializing.
- `serializeRouteMeta(meta)` renders `<title>`, `<meta>`, `<link>`, and JSON-LD
  markup for a server-rendered `<head>`.
- `reconcileRouteMeta(meta, target?)` replaces only Askr-owned head nodes after
  a client navigation. The router calls it for every navigation, with empty
  metadata when the destination declares none, so a previous route's head
  nodes never outlive it. A `<title>` the document already had (a static
  shell title) is updated in place and restored when a route has no title;
  the root `lang` and `dir` are restored the same way. Only values the
  router wrote are put back: a title, `lang` or `dir` the application
  changed itself stays as the application left it.

## Route testing helpers

Use these helpers without mounting an app:

- `matchRoute(path, { registry })` from `@askrjs/askr/router` returns the matched route and params, or
  `null`.
- `getRouteWarnings({ registry })` from `@askrjs/askr/testing` reports named-splat routes whose segments
  collide with sibling static routes.

## `fallback(Component)`

Registers a pathful miss route.

- At the root, `fallback()` registers the app-wide catch-all route.
- Inside `page()`, `fallback()` registers a miss route for that page subtree.
- `fallback()` does not scope to `group()` because `group()` is pathless.
- Inside a page subtree, `fallback()` must be declared directly in the `page()` scope.
- Page prefix segments match like route segments, so a `fallback()` inside
  `page('/{lang}')` handles misses under `/en/...` and `/fr/...` and receives
  `lang` alongside the `*` capture.
- Nearest pathful fallback wins: the one whose page prefix matches the most URL
  segments, however those segments are percent-encoded. At equal depth the
  more specific prefix wins (`/en/blog` over `/{lang}/blog`).

## `currentRoute()`

Inside a component, call `currentRoute()` to read the current route snapshot,
including entry-local `state` and `hasState`.

`currentRoute<TParams, TState, TAppMeta>().matches` exposes application metadata
from metadata-bearing groups/pages in declaration order, followed by the leaf.
Groups use the enclosing path prefix, so multiple entries may share a path.
Ancestors without `appMeta` add no entries; registries without `appMeta` keep
their one-leaf match list. Every entry carries the full leaf parameter record.
`currentRoute().params`, `matchRoute()` and activity predicates retain leaf
matching semantics. `matchRoute<TAppMeta>()` reads only the best leaf's metadata.

The appended metadata generics default to `unknown`; existing generic positions
are unchanged. Use application-owned `satisfies` declarations or
`RouteOptions<TParams, TSearchSchema, TLoaderData, TDehydratedData, TAppMeta>`,
`GroupHelperOptions<TAppMeta>` and `PageHelperOptions<TAppMeta>` to check inputs.
An explicit read generic declares your schema; the opaque registry callback does
not contextually enforce or infer that schema for global authoring helpers.

See [application route metadata](../guides/application-route-metadata.md) for
reactive grants, declaration immutability and SSR/browser visibility boundaries.

`currentAuth()` reads the identity of the committed page. A custom
`resolve` runs for each navigation, and the identity it produces is
published when that navigation commits, so a page still on screen while a
navigation is pending, failed or superseded keeps the identity it rendered
with.

## `onRouteChange(callback, options?)`

Runs after a persistent component commits a pathname, query, or hash change. The
initial route is skipped by default; pass `{ immediate: true }` to include it.
The callback receives the current and previous route snapshots. A returned
cleanup runs before the next callback and when the component unmounts. Failed or
superseded navigations do not publish a callback. Each committed change keeps
its own callback and snapshots when several commits occur before callbacks
flush. The destination snapshot includes that destination's entry state while
the navigation commits, before the browser history write completes.
Browser history back/forward
navigations are committed route changes and invoke the callback as well. During
SSR and SSG there is no client navigation commit, so `onRouteChange` does not
run; use the render-time route APIs for initial data.

```ts
import { onRouteChange } from '@askrjs/askr/router';
declare function announce(message: string): void;
declare function cancelAnnouncement(path: string | undefined): void;

function Shell() {
  onRouteChange((current, previous) => {
    announce(`Opened ${current.path}`);
    return () => cancelAnnouncement(previous?.path);
  });
  return <main />;
}
```

## `resolveRouteRequest(url, options)`

Resolves a URL against a registry and applies route policies, auth, preloads
and loaders without rendering. A server that renders the page should call
`renderRouteRequest()` or `renderRouteRequestToString()` from
`@askrjs/askr/ssr` instead: they resolve once and return the same redirect,
deny, and no-match decisions. A render result carries `status: 404` when a
`fallback()` rendered the miss, so a host can send the right status without
inspecting the route; a matched route has no `status`. Use `resolveRouteRequest()` only when you need
the decision and will not render the route, since loader and preload work is
not reused by a later render.

```ts
import { resolveRouteRequest, type RouteRegistry } from '@askrjs/askr/router';
declare const registry: RouteRegistry;

// Returns a response for redirects, denials, and misses; null when the route
// may be served.
export async function decide(request: Request): Promise<Response | null> {
  const result = await resolveRouteRequest(request.url, {
    registry,
    mode: 'ssr',
    request,
    signal: request.signal,
  });
  if (result === null) return new Response('Not found', { status: 404 });
  if (result.kind === 'redirect') {
    return Response.redirect(
      new URL(result.to, request.url),
      result.status ?? 302
    );
  }
  if (result.kind === 'deny') {
    return new Response(null, { status: result.status });
  }
  return null;
}
```

Options: `registry` (required), `mode`, `auth`, `authContext`, `request`,
`signal`, and `telemetry`. On a server, pass `mode: 'ssr'`; the default is
`'spa'` whenever a global `window` exists. Pass `signal` explicitly: it is not
taken from `request.signal`.

The result is `null` when no route matches or the URL is outside the registry
base path, a redirect or deny decision, or the matched route with its params.
Depending on which steps run, the result is a plain value or a Promise, and
errors may throw synchronously, so always `await` the call inside an `async`
function.

## `navigate(target)`

Triggers client-side navigation. `target` is a logical path string or a typed
destination from `to()`. A target that differs from the current location only
by its fragment moves the location and scrolls to the fragment without
resolving the route again: no loader runs and the rendered page keeps its
state. Back and forward traversal between entries that differ only by
fragment behaves the same way. A target equal to the current location is resolved again and replaces
the history entry unless `history: 'push'` is given. A URL on another origin is not rendered by the
router: Askr hands it to the browser with `location.assign()`, or
`location.replace()` for replace history. Guard redirects to another origin
load the same way, including a redirect taken while the app first loads. Only a
target written with an explicit `http:` or `https:` scheme may leave the
origin. A path-like string that the URL parser resolves to another host, such
as `//evil.example`, `/\evil.example` or `\\evil.example`, throws a
`TypeError`. So does a same-origin path whose dot segments collapse to a
leading `//` (`/.//evil.example`, `/%2e//evil.example`, `/x/..//evil.example`),
because its root-relative form names another host. History entries and
document loads always receive the absolute URL. The same rule applies to redirect decisions on the server
(`resolveRouteRequest()`, `renderRouteRequest()`, `SSRAccessDecisionError`),
to `loginPath`/`authenticatedRedirectTo`, and to `<Link href>`, which throws at
render.

`navigate()` and `redirect()` are redirect sinks, and so is a server that copies
`decision.to` into a `Location` header. Askr refuses path-like cross-origin
targets, but an explicit `https://evil.example` is still followed. For
untrusted input, such as a `?next=` query value, use `localTarget()` and the
`sameOrigin` option:

```ts
import { localTarget, navigate } from '@askrjs/askr/router';

// After sign-in: the destination came from the URL, so reduce it first.
const next = new URLSearchParams(location.search).get('next');
navigate(localTarget(next, '/dashboard'));

// Or refuse anything off-origin outright.
navigate(next ?? '/', { sameOrigin: true });
```

`localTarget(value, fallback = '/')` returns `value` as a same-origin
root-relative href (path, query and fragment), or `fallback` when `value` is
missing, names another origin (including an explicit `https://` URL), parses to
another host (`//evil.example`, `/\evil.example`), collapses to a leading `//`
(`/.//evil.example`) or uses a non-http scheme. A relative value resolves
against the origin root; an absolute URL on the current origin is accepted and
returned root-relative. `navigate(target, { sameOrigin: true })` throws a
`TypeError` for any target on another origin, including an explicit `http(s)`
URL, instead of handing it to the browser. A server has no origin to compare
with, so there `localTarget()` accepts only root-relative values.

When navigation replaces the active route,
Askr disposes route-local component state, resources, tasks, and abort signals
before mounting the replacement. Reconciliation can preserve shared layout DOM
nodes, but state that must survive navigation belongs in a shared layout,
context, or external store.
Shared layout components retain their own lifecycle work while that layout
remains in the route tree; leaving the layout disposes that work.

`navigate(path, { state })` stores transient state on the destination browser
history entry without serializing it into the URL. Push, replace, redirects,
and Back/Forward preserve entry ownership. The state is browser-only and is
therefore absent from SSR and SSG snapshots, even when server rendering runs
in a process with a browser-like `window`. Client rendering and hydration read
the state from the current browser entry.

When no registered app can render the destination, because no route or
`fallback()` matches it or it is outside every registry's `basePath`, Askr hands
it to the browser as a full document load (`location.assign()`, or
`location.replace()` for replace navigation). Declare a `fallback()` to render a
not-found page in place instead. Back/Forward to such an entry reloads the
document, so the old page never stays mounted under the new URL. An entry that
differs from the rendered page only by its fragment, such as one added by a
`#section` link, keeps the page without reloading.

This also applies when no router is mounted: `navigate()` called from an island
or other unrouted code loads the destination as a document. Navigating to the
URL that is already loaded is skipped with a development warning instead, so
code that navigates on mount cannot reload the page forever.

If rendering a Back/Forward destination fails, or its loader or policy
rejects, Askr keeps the rendered page and uses `history.go()` to return to that
page's entry. This can be more than one
entry away when the failed traversal superseded one that was still loading.
History entries are never rewritten, so the entry that failed stays in the
stack and can be traversed to again. Navigating while that return is pending
cancels it, and the returning traversal then renders normally.

Askr records each entry's position (`askrIndex`) in the history state it
writes. An entry added by a plain fragment link is placed after the entry it
was followed from. If other code writes an entry, for example with
`history.pushState()`, positions are unknown until the user returns to an entry
Askr wrote, and a failed Back/Forward reloads the landed URL instead of guessing
which entry to return to.

## Focus and announcements

`createSPA()` and `hydrateSPA()` accept `focus: false | { target?, announce? }`.
By default, after a navigation to another path that adds or replaces a history
entry (not the first load, not back/forward, not a fragment or query-only
change), focus moves to the first `[data-askr-focus-target]`, else `<main>`,
else the first `<h1>`, else the app root, and a visually hidden polite live
region announces the document title (the pathname when there is none).
`target` is a CSS selector or `(root) => Element | null`; `announce` is
`(route) => string` receiving `{ pathname, search, hash, title }`, or `false`
to stay silent. `focus: false` disables both. A text-entry control that
survives the navigation keeps focus. See the
[navigation guide](../guides/navigation.md#focus-and-announcements).

## View transitions

`navigate(target, { viewTransition: true })`, `<Link viewTransition>` and the
`viewTransitions: boolean | ((from, to) => boolean)` option of `createSPA()` and
`hydrateSPA()` (default `false`) run the navigation commit inside
`document.startViewTransition()` when the browser provides it; otherwise it
commits directly. A per-navigation `viewTransition` overrides the app option.
Back/forward traversals follow the app option. See the
[navigation guide](../guides/navigation.md#view-transitions).

## `navigationState()`

`navigationState()` returns `{ pending, to, revalidating, blocked }`:

- `pending`: a client navigation is waiting on route resolution (auth,
  policies, lazy chunk, `preload`, loaders). It stays false for navigations
  that resolve synchronously, such as to a cached route with no policies.
- `to`: the public href being navigated to while `pending`, else `null`.
- `revalidating`: cached route data is being refreshed in the background (see
  [Loader cache](#loader-cache)).
- `blocked`: the public href of the latest navigation a `blockNavigation()`
  blocker refused (a link or `navigate()`, a redirect, `updateRouteQuery()`, a
  traversal), until the next navigation begins; otherwise `null`. Use it to
  show your own "unsaved changes" prompt.

Called while rendering a client component it is reactive: the component renders
again when a field changes. The returned object is replaced, never mutated.
Outside a component it reads the current value. On the server it is always idle.

```tsx
import { navigationState } from '@askrjs/askr/router';

function TopBar() {
  const { pending } = navigationState();
  return <progress hidden={!pending} aria-label="Loading page" />;
}
```

## `blockNavigation(shouldBlock)`

Asks before the router leaves the current page, for forms with unsaved work.
`shouldBlock` returns `false` to allow, `true` to refuse silently (show your own
dialog, then unblock and navigate), or a string to ask the visitor to confirm
with `window.confirm(message)`. The first blocker that objects decides. It is
evaluated for `navigate()`, `<Link>` clicks, `updateRouteQuery()`, back/forward
traversals and, while any blocker is registered, for `beforeunload`. A policy or
auth redirect met while an in-app navigation resolves is a second departure and
consults blockers again (a message the visitor already confirmed for that
navigation is not asked twice); a refusal leaves the page as it is. A
`updateRouteQuery()` that a blocker refuses is dropped: the function still
returns `undefined` and nothing changes. Every refusal is reported as
`navigationState().blocked`. The returned function removes the blocker.

```ts
import { blockNavigation } from '@askrjs/askr/router';

let dirty = false;
const unblock = blockNavigation(() =>
  dirty ? 'You have unsaved changes. Leave this page?' : false
);

// Call unblock() when the form is saved or its view is torn down.
unblock();
```

Limitations:

- A blocked back/forward traversal has already moved the browser. The router
  returns to the rendered entry with `history.go()` using the history index it
  stamps on entries it writes, so the destination URL can flash. When that
  position is unknown (other code wrote history entries), the router pushes the
  rendered location again instead: the page and URL agree, at the cost of one
  extra history entry and the loss of forward entries, and the entry's
  `navigate()` state is not restored.
- Session-auth redirects (a session expiring or changing identity) and
  fragment-only moves are not blocked; documents opened by `target="_blank"` are
  not affected.
- The `beforeunload` prompt uses the browser's fixed text; a string result only
  matters for in-app navigation.
- Blockers are global to the page, not scoped to a component: remove them with
  the returned function.

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

A query update is the newest location: a navigation that is still resolving is
superseded and cannot publish over it, and `navigationState().pending` clears.
Loaders do not re-run for a query update; read the query through
`currentRoute().search` or `query` and navigate with `navigate()` when the data
must reload.

## `Link`

Declarative navigation component.

```tsx
import { Link } from '@askrjs/askr/router';

<Link href="/about">About</Link>;
```

`Link` accepts normal renderable child content. Imperative DOM `Node` children are not a supported public contract.

A left click on a same-origin `Link` navigates through `navigate()`. A target no
registered app can render, such as another app on the same origin outside the
`basePath`, falls back to a full document load, so the click is never dead.

`Link` handles a plain left click on a same-origin `http`/`https` URL in the
router. It leaves the click to the browser for modifier keys, `download`, other
origins, and a `target` naming another browsing context (`_blank`, a frame
name). `target="_self"` still navigates in the router.

Raw `href` values may be relative URLs or use `http`, `https`, `mailto`,
`sms`, `tel`, or `blob`. `Link` rejects other explicit schemes, including
executable and local-file URLs.

Props that shape the navigation, matching `navigate()` options:

- `replace`: replace the current history entry instead of pushing one.
- `state`: entry-local history state for the destination (see `navigate()`).
- `scroll`: `'top'` (the default) or `'preserve'`.
- `prefetch`: `'none'` (the default), `'intent'` or `'render'`. `'intent'` warms
  the destination on pointer enter and keyboard focus; `'render'` does it when
  the link mounts. Prefetching starts the matching route's lazy chunk
  (`lazy().preload()`) and resolves the route like a navigation (auth, policies,
  `preload` and loaders through the [loader cache](#loader-cache)) without
  rendering or committing anything, so the click that follows renders from warm
  data. Failures are silent and surface on the real navigation; the same href is
  not prefetched again for thirty seconds; other origins and hrefs no route
  matches are ignored; nothing runs on the server. Prefetch runs auth resolvers
  and policies, so keep them cheap and idempotent. A route with the default
  `staleTimeMs` still revalidates when visited; set `staleTimeMs` to treat the
  warmed result as fresh.

```tsx
<Link href="/posts/42" prefetch="intent" scroll="preserve">
  Post 42
</Link>
```

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

## `createSessionAuth(options)`

Creates the client binding for same-origin server provider sessions.
Pass its exact result as registry/boot auth; it owns the root's private data
runtime, adopts a minimal SSR identity, dedupes session GETs and retires private
state before logout or identity revalidation. `loginHref`, `logout` and decoded
`handleAuthFailure` compose with the same router owner. See the
[provider-session guide](../guides/provider-sessions.md) for transport, ownership
and recovery contracts.
