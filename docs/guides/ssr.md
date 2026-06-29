# SSR Guide

Askr's current SSR APIs render UI to HTML strings for server output.

## High-level workflow

1. Create a route registry.
2. Resolve request path on server.
3. Render to HTML with SSR APIs.
4. Hydrate on the client with matching route state.

## Current status

- The shipped SSR API is currently synchronous and best suited to static or preloaded data.
- Async components and async server data resolution are not part of the finished SSR story yet.
- Use deterministic inputs for stable hydration output.
- URL-based SSR helpers keep route tables in per-render context instead of mutating the client router registry.

If you need streaming HTML or request-time async data loading, Askr does not have
a production-finished answer for that today.

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
`pathname`, `params`, `search`, `hash`, `data`, and the matched route template.

When you pass `document` to `renderToStream()`, Askr buffers the app HTML first,
applies the callback, then emits the wrapped document output.

## Related topics

- [SSG Guide](ssg.md)
- [SSR Events](ssr-events.md)
- [Selective Hydration](../advanced/selective-hydration.md)

## Next

- [API Overview](../reference/api.md)
- [Troubleshooting](../troubleshooting/common-issues.md)
