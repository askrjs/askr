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

## Deferred route responses

Server adapters should call `renderRouteRequest()`. A route without pending
deferred values returns its complete `html` and no `stream`. A deferred route
also returns `stream`; use `result.stream ?? result.html` as the response body.
The stream emits fallback markup first, then ordered boundary templates and
settled hydration data. Request abort and response cancellation stop unresolved
boundary work.

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

When you pass a registry, URL-based SSR applies the registry's synchronous route
auth and policy decisions before rendering. Denied routes render the same
denial marker used by client startup and hydration, and redirects render the
final target route.

## Document rendering boundary

Keep shared route tables app-only by passing a document renderer at the SSR boundary:

```ts
import { renderToString } from '@askrjs/askr/ssr';
import { registry } from './routes';

const html = renderToString({
  url: '/',
  registry,
  document: ({ appHtml, context }) => `<!doctype html>
<html lang="en">
  <head>
    <title>${context.pathname}</title>
  </head>
  <body>
    ${appHtml}
  </body>
</html>`,
});
```

The `document` callback receives the rendered app HTML plus route context such as
`pathname`, `params`, `search`, `hash`, `data`, `cspNonce`, and the matched route
template. Pass the same request nonce as `cspNonce` to SSR and browser
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
