# Core: Rendering

Askr supports three output modes: DOM (SPA), server-rendered HTML (SSR), and pre-rendered
HTML files (SSG). The same component code works in all three modes.

## DOM rendering (SPA)

The default mode. Components are rendered into the DOM via
`createSPA({ root, registry })` or `createIsland({ root, component })`.

Keyed `For` updates publish through one renderer transaction. If evaluation or
DOM commit fails, Askr restores the previously committed DOM and ownership
state; provisional listeners, refs, portals, resources, subscriptions, and
child owners do not become live. Cleanup belonging to a successful commit runs
only after the coherent DOM update. Cleanup failures are reported together and
do not roll back an already successful render.

See [Runtime](./runtime.md) for boot APIs.

## Server-Side Rendering (SSR)

Askr renders components to an HTML string on the server. The client hydrates the result.

### Current status

The component render phase is synchronous. Critical route-loader data is
awaited before rendering. Explicit `defer()` values render a `Resolve` fallback
immediately and make the route-request result streamable; async components,
async `resource()` loaders, and async document renderers still throw so output
remains deterministic.

### URL-based rendering

Use the URL-based helper when the server needs to resolve routes explicitly:

```tsx
import { renderToString } from '@askrjs/askr/ssr';
import { createRouteRegistry, route } from '@askrjs/askr/router';

const registry = createRouteRegistry(() => {
  route('/users/{id}', ({ id }) => <div>User {id}</div>);
});

const html = renderToString({ url: '/users/42?q=active', registry });
```

The URL is parsed and matched against registry routes. The matched component renders
to an HTML string.

To keep route handlers app-only, pass a `document` callback that wraps the
rendered app HTML into a full document:

```tsx
const document = ({ appHtml, context }) => `<!doctype html>
<html lang="en">
  <head>
    <title>${context.pathname}</title>
  </head>
  <body>
    ${appHtml}
  </body>
</html>`;

const html = renderToString({
  url: '/users/42?q=active',
  registry,
  document,
});
```

The lower-level `renderToStream()` document callback buffers app HTML before
wrapping it. Full-stack applications instead return the route-request Web
stream to `@askrjs/vite/server`, which composes template prefix, app chunks,
and suffix without buffering the complete response.

### Client hydration

```ts
import { hydrateSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route } from '@askrjs/askr/router';

const registry = createRouteRegistry(() => {
  route('/', () => <Home />);
});

await hydrateSPA({ root: 'app', registry });
```

When a server-rendered subtree is entirely intrinsic and its tags, attributes,
form state, text, and child shape already match, hydration adopts those nodes
in place and publishes only refs and event bindings. The adoption is scoped to
the synchronous hydration mount and remains transactional. Keyed trees,
components, reactive props, and any mismatch use the normal reconciliation
path.

When `hydrate.deferBelowFold` is enabled, each deferred marker owns a local
hydration record. Revealing one boundary activates only that boundary inside a
single lifecycle transaction; it does not rerun the application root. Refs,
listeners, reactive bindings, and ownership are published at commit. A failed
activation restores the marker and remains retryable, while root cleanup drops
unrevealed records. Permanent `skipSelectors` remain skipped.

## Static Site Generation (SSG)

SSG pre-renders Askr routes into `.html` files at build time.

### Programmatic API

```ts
import { createStaticGen } from '@askrjs/askr/ssg';
import { createRouteRegistry, route } from '@askrjs/askr/router';

const registry = createRouteRegistry(() => {
  route('/', () => <HomePage />);
  route('/about', () => <AboutPage />);
});

const ssg = createStaticGen({
  registry,
  outputDir: './dist/static',
});

const result = await ssg.generate();
console.log(result.successful, result.totalRoutes);
```

SSG accepts the same synchronous `document` callback, which keeps the route
table shared across SPA, SSR, and SSG while userland still owns the actual HTML
template.

```ts
const ssg = createStaticGen({
  registry,
  outputDir: './dist/static',
  document,
});
```

### CLI SSG

```bash
askr ssg --config ./ssg.config.ts --output ./dist/static
```

### What SSG generates

- Route HTML files: `/` -> `index.html`, `/about` -> `about/index.html`
- Build metadata: `metadata.json` with per-route status, file sizes, and render durations

### Data overrides

Provide route-keyed data when components need pre-supplied values:

```ts
const ssg = createStaticGen({
  registry,
  outputDir: './dist/static',
  dataOverrides: {
    '/': { appName: 'my-site' },
  },
});
```

SSG awaits route expansion and recursively settles every explicitly deferred
loader value before rendering. A rejected deferred value fails that route, and
staged output prevents a partial site from replacing the last complete build.

## See also

- [SSR guide](../guides/ssr.md)
- [SSG guide](../guides/ssg.md)
- [Runtime](./runtime.md)
- [Routing](./routing.md)
- [CLI workflows](https://github.com/askrjs/askr-cli/tree/main/docs/workflows.md)
