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

### Transparent component ranges

A component may return a Fragment or an array when it needs multiple sibling
nodes without an application-visible wrapper:

```tsx
function PageHeader() {
  return (
    <>
      <h1>Dashboard</h1>
      <nav>...</nav>
    </>
  );
}
```

Fragments and arrays remain structurally transparent in SPA rendering, SSR,
SSG, and hydration. Their nodes are direct siblings at the component call
site. This includes context scopes that return their marked children together
with an automatic portal host. Askr uses internal comment-anchored ranges to
retain update and cleanup ownership; it does not insert a `div` or another
visible host element.

During hydration, a keyed `For` adopts only its own server-rendered rows even
when a static or component child precedes it in the same parent. The unrelated
sibling and every adopted row keep their DOM identity through later reorder
and removal commits.

### Imperative widget hosts

Use `imperativeChildren` when a third-party widget owns all descendants of an
intrinsic host. Askr will keep updating the host's attributes, event handlers,
and ref, but it will not reconcile or detach the widget-owned DOM after mount.

```tsx
function EmbeddedWidget() {
  return <div ref={mountWidget} imperativeChildren />;
}
```

The marker is renderer-only and is not emitted as an HTML attribute. Leave it
off for normal declarative elements so removing JSX children continues to clear
their DOM and lifecycle ownership normally.

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
the hydration mount or a deferred-boundary activation and remains
transactional. Range markers, matching elements, empty placeholders,
transparent component ranges, and SSR portal hosts are eligible for adoption
only inside that scope. Keyed trees, reactive props, and any mismatch use the
normal reconciliation path.

Ordinary client reconciliation never infers ownership from matching-looking
DOM. Unmatched nodes and ranges are removed from a captured next sibling,
their component subtrees are torn down exactly once, and newly rendered
content receives fresh ownership. This distinction prevents stale server-like
or consumer-inserted DOM from surviving a control-boundary update while
preserving node identity, focus, selection, context, and portal anchors during
real hydration.

When `hydrate.deferBelowFold` is enabled, each deferred marker owns a local
hydration record. Revealing one boundary activates only that boundary inside a
single lifecycle transaction; it does not rerun the application root. Refs,
listeners, reactive bindings, and ownership are published at commit. A failed
activation restores the marker and remains retryable, while root cleanup drops
unrevealed records. Permanent `skipSelectors` remain skipped.

### Portals on the server

`Portal`, `DefaultPortal`, and portals created by `definePortal()` render in
SSR and SSG output. Host and writer evaluation order does not affect the
result: Askr collects portal writes for the current render root, then places
the final value at its host position.

```tsx
import { DefaultPortal, Portal } from '@askrjs/askr/foundations';

const Page = () => (
  <main>
    <DefaultPortal />
    <Portal>
      <div class="overlay">Open overlay</div>
    </Portal>
  </main>
);
```

An explicit `DefaultPortal` is preferred over the automatic host appended by
the SSR and SSG runtimes. Without an explicit host, the automatic host renders
the content after the application root. Multiple writes to the same portal use
the final value, matching the client runtime.

Portal values are scoped to one server render root. A portal created with
`definePortal()` can be reused by application code without carrying content
between routes or requests. Hydration adopts the server-rendered portal
content and attaches its normal bindings.

SSR and SSG retain internal comment anchors at default-portal writer positions
and at a written automatic host whose current value is empty. Hydration adopts
those anchors so adjacent application nodes keep their identity without a
visible wrapper element. Unused or explicitly suppressed automatic hosts are
omitted.

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
