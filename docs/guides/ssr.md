# SSR Guide

Askr preserves synchronous string rendering for ordinary routes and exposes a
Web stream only when a route contains an explicitly deferred value.

## High-level workflow

1. Create a route registry.
2. Resolve request path on server.
3. Render to HTML with SSR APIs.
4. Hydrate on the client with matching route state.

## Current status

- The component render phase remains synchronous. `defer()` marks the promises
  that may settle after fallback HTML is flushed.
- Async components, async `resource()` loaders, and async document renderers are rejected during SSR instead of awaited.
- Use deterministic inputs for stable hydration output.
- URL-based SSR helpers keep route tables in per-render context instead of mutating the client router registry.

Critical loader data is awaited before rendering. Wrap only non-critical
promises with `defer()` and render them through `Resolve`.

## Supported server runtimes

Synchronous rendering (`renderToString()`, `renderToStringSync()`) works on any
JavaScript runtime. `renderRouteRequest()` and other async render work keep each
request's render context in `AsyncLocalStorage` so concurrent requests stay
isolated. Async rendering is supported on runtimes that provide
`AsyncLocalStorage` globally or via `process.getBuiltinModule`. Askr resolves
it on first use, in this order:

1. `globalThis.AsyncLocalStorage`.
2. `process.getBuiltinModule('node:async_hooks')`.

Node.js 24+ (the supported Node range) provides the second. Other runtimes
qualify when they implement either API; for example, recent Deno and Bun
releases and Cloudflare Workers with Node.js compatibility enabled. Check your
runtime's documentation for its current support.

Neither path is a static import or evaluates code, so client bundles never pull
in `node:async_hooks` and pages served under a CSP without `'unsafe-eval'` are
unaffected. On a runtime that offers neither, synchronous rendering still works
and async render work rejects with an error naming the missing
`AsyncLocalStorage`.

## Deferred route responses

Server adapters should call `renderRouteRequest()`. A route without pending
deferred values returns its complete `html` and no `stream`. A deferred route
also returns `stream`; use `result.stream ?? result.html` as the response body.
The stream emits fallback markup first, then one boundary template per
`Resolve` as soon as its value settles, so a slow boundary never holds back a
faster one. Boundary ids are deterministic (`d:0`, `d:1`, ... in render order),
and patches may arrive in any order. A `Resolve` rendered inside a settled
boundary's content streams too: its fallback ships in the parent's template and
its own template (id `d:0.0` for the first pending `Resolve` inside `d:0`)
follows when its value settles. Settled hydration data comes last, once every
boundary, nested ones included, has been patched. Request abort and response
cancellation stop unresolved boundary work. Each boundary template renders with the request's route state
and identity: `currentRoute()`, `Link` and route activity inside `Resolve` see
the request URL, route table, base path and matched params, and `currentAuth()`
sees the request's identity.

```tsx
import { defer, Resolve, route, routeData } from '@askrjs/askr/router';

type Summary = { total: number };

route('/report', Report, {
  loader: () => ({ summary: defer(loadSummary()) }),
});

function Report() {
  const data = routeData<{ summary: ReturnType<typeof defer<Summary>> }>();
  return Resolve({
    value: data.summary,
    pending: <p>Loading summary…</p>,
    children: (summary) => <SummaryView summary={summary} />,
  });
}
```

Hydration revives settled deferred data and adopts the streamed DOM; it does
not rerun the server loader.

Start browser hydration from a normal, non-async `type="module"` entry placed
after the app markup. Module execution waits for the streamed document to
finish parsing, so deferred boundary patches and their hydration data are in
place before `hydrateSPA()` runs. Do not start hydration from an async module
or an early classic script while the response stream is still open; that
ordering is outside the deferred-stream hydration contract.

## Route data transport and field omission

Route loader values are validated before hydratable output is returned. The
transport is deliberately JSON-shaped: primitives (with finite numbers), dense
arrays, plain objects, and Askr deferred-value encoding are supported. Values
whose JSON representation is lossy or ambiguous are rejected with the concrete
route and property path.

Query data follows the same transport rules. `dehydrateDataRuntime()` (and
therefore every SSR/SSG render that embeds a data runtime) throws a
`TypeError` naming the query key and property path when a cached value is not
JSON-shaped, for example a `Date`, `Map`, `Set`, class instance, bigint,
non-finite number, `undefined`, or cyclic reference. It never silently drops
or coerces an entry; map such values to JSON-compatible data in the query
`fetch` or server handler (for example an ISO string instead of a `Date`).
An SSR-mode `prefetchQuery()` applies the same check as each value arrives,
so a route `preload` rejects before a streamed shell is sent rather than
truncating the response.

Use a synchronous route `dehydrate` selector to keep server-only or sensitive
fields out of the browser payload:

```tsx
route('/reports/{id}', Report, {
  loader: ({ params }) => loadReport(params.id),
  dehydrate: (report) => ({
    title: report.title,
    interactiveSeries: report.interactiveSeries,
  }),
});
```

The server render receives the full report. Initial hydration receives only the
selected object, and an attempted read of a known omitted branch throws an
actionable error. Normal client navigation reruns the loader and receives the
complete report. The selector is a transport/security boundary, not a static
subtree declaration: hydrated components must still be able to render from the
selected data.

## Hydrating authenticated pages

The server resolves the identity for a request (for example from an httpOnly
session cookie passed to `renderRouteRequest({ authContext })`). By default,
none of that identity reaches the browser: the hydration payload contains no
principal, session, tenant, or `authenticated` flag. `hydrateSPA()` then
resolves the initial route again with the client `auth.resolve`, and a client
that cannot see the cookie is anonymous, so a protected page would redirect to
the login route as soon as it hydrates.

Opt in with `auth.dehydrate` to send a minimal identity snapshot for hydration:

```ts
const registry = createRouteRegistry(routes, {
  auth: {
    loginPath: '/login',
    dehydrate: (auth) => ({
      authenticated: auth.authenticated,
      principal: auth.principal
        ? { id: auth.principal.id, roles: auth.principal.roles }
        : null,
      tenant: null,
    }),
  },
});
```

- `dehydrate` runs on the server with the identity that authorized the page,
  on every page render, including public pages visited anonymously (those
  carry an anonymous stub: `authenticated: false`, `principal: null`).
- `authenticated`, `principal`, `tenant`, and `scopes` of the returned object
  are serialized **verbatim**, including every nested field. Build a new,
  minimal `principal` with only what the client renders and what route `auth`
  requirements check (typically `id` and `roles`). Never return the resolved
  principal as-is: it can carry password hashes, tokens, or personal data.
- The session is never serialized; its id is often the cookie value itself.
  On the client `currentAuth().session` is always `null`.
- The snapshot is JSON-encoded into the page's hydration payload with the same
  escaping as route data, and is readable by any script on the page.
- A page carrying a dehydrated identity is personalized. Serve it with
  `Cache-Control: private` (or `no-store`), never from a shared cache or CDN,
  or one visitor's identity is served to another.
- `hydrateSPA()` uses the snapshot, instead of calling `auth.resolve`, to
  resolve and render the initial route the server already authorized, so
  `currentAuth()` matches the server render. Components cannot read the raw
  snapshot from render data. When `auth.resolve` is configured, later
  navigations resolve the identity with it. Without `auth.resolve`, the
  snapshot stays the client identity for navigations until the next full page
  load.
- The snapshot is not a credential and grants nothing. Client route decisions
  are presentation only; the server remains responsible for authorizing every
  request and all data.
- `auth.resolve` is optional, so an app whose identity is only visible to the
  server can configure `{ loginPath, dehydrate }` alone.

## URL-based rendering

Use the URL-based helpers when the server should resolve routes explicitly.
New apps should pass the registry returned by `createRouteRegistry()`:

```ts
import { createRouteRegistry, route } from '@askrjs/askr/router';
import { renderToString } from '@askrjs/askr/ssr';

const registry = createRouteRegistry(() => {
  route('/users/{id}', ({ id }) => <div>User {id}</div>);
});

const html = renderToString({
  url: '/users/42?q=active',
  registry,
});
```

For a deployment mounted below the origin root, configure the registry once:

```ts
const registry = createRouteRegistry(
  () => route('/users/{id}', ({ id }) => <div>User {id}</div>),
  { basePath: '/website' }
);
const html = renderToString({
  url: '/website/users/42?q=active',
  registry,
});
```

SSR matches the physical request after removing the base, while route loaders,
policies, metadata, and `currentRoute()` observe `/users/42`. Rendered internal
links include `/website`. Registry-based SSG keeps logical output paths but
renders the same mounted links, so the hosting layer can publish the artifact
at either `/website` or `/` by changing `basePath` at build time. Bundler asset
prefixes are configured separately.

When you pass a registry, URL-based SSR applies the registry's synchronous route
auth and policy decisions before rendering. A redirect or deny decision is not
rendered: `renderToString()` and `renderToStream()` throw
`SSRAccessDecisionError`, whose `decision` is the same redirect or deny result
that `renderRouteRequest()` returns, so the server can send the matching
response:

```ts
import type { RouteRegistry } from '@askrjs/askr/router';
import { renderToString, SSRAccessDecisionError } from '@askrjs/askr/ssr';

function respond(url: string, registry: RouteRegistry): Response {
  try {
    return new Response(renderToString({ url, registry }), {
      headers: { 'content-type': 'text/html' },
    });
  } catch (error) {
    if (!(error instanceof SSRAccessDecisionError)) throw error;
    const { decision } = error;
    return decision.kind === 'redirect'
      ? new Response(null, {
          status: decision.status ?? 302,
          headers: { location: decision.to },
        })
      : new Response(null, { status: decision.status });
  }
}
```

The synchronous helpers do not run route loaders. Rendering a route that
declares a `loader` throws `SSRDataMissingError` before any resolution work
starts, so its auth, policies, `preload`, lazy import, and loader are not run.
A route whose auth, policies, `preload`, or not-yet-loaded lazy component
resolve asynchronously also throws `SSRDataMissingError`; once a lazy route's
component has loaded, it renders synchronously. Use `renderRouteRequest()` for
those routes; it awaits resolution and loaders and returns redirect and deny
decisions as results.

## Document rendering boundary

Keep shared route tables app-only by passing a document renderer at the SSR boundary:

```ts run=ssr-document
import {
  escapeHtml,
  renderToString,
  type DocumentRenderer,
} from '@askrjs/askr/ssr';
import { registry } from './routes';

const document: DocumentRenderer = ({ appHtml, context }) => `<!doctype html>
<html lang="en">
  <head>
    <title>${escapeHtml(context.pathname)}</title>
  </head>
  <body>
    ${appHtml}
  </body>
</html>`;

const html = renderToString({ url: '/', registry, document });
```

The `document` callback receives the rendered app HTML plus route context such as
`pathname`, `params`, `search`, `hash`, `data`, `cspNonce`, and the matched route
template. The template is plain string concatenation, so pass every
request-derived value (`pathname`, `params`, `search`, loader `data`) through
`escapeHtml()` before interpolating it into text or a quoted attribute. It
escapes `&`, `<`, `>`, `"` and `'`, accepts any value (`null` and `undefined`
become an empty string, anything else goes through `String()`). Only `appHtml` is already rendered markup;
do not escape it, and do not use `escapeHtml()` inside `<script>` or `<style>`.
Pass the same request nonce as `cspNonce` to SSR and browser
boot/hydration. Askr validates it before rendering, exposes it through
`cspNonce()` during component render, and applies it to deferred-patch scripts.

Components may also register request-local styles in `context.styles`. When that
collection is non-empty, Askr checks that the returned document represents each
registration and warns if the renderer silently drops one. Select strict build
or server enforcement with `styleRegistrationValidation: 'error'`. Set it to
`'off'` only when omission is intentional, such as when an application has
already externalized those rules.

Do not put a nonce in static-generation options. A build-time nonce is reusable;
SSG deployments should use external styles, CSP hashes, or per-response edge
injection.

When you pass `document` to `renderToStream()`, Askr buffers the app HTML first,
applies the callback, then emits the wrapped document output.

## Related topics

- [SSG Guide](ssg.md)
- [SSR Events](ssr-events.md)
- [Selective Hydration](../advanced/selective-hydration.md)

## Next

- [API Overview](../reference/api.md)
- [Troubleshooting](../troubleshooting/common-issues.md)
