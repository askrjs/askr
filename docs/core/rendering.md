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

### Fine-grained bindings and rollback

A function-valued prop or child (`title={() => ...}`, `{() => count()}`) is a
fine-grained binding. When a render swaps a binding's function, that update
belongs to the render's transaction: if the render fails, the binding keeps the
value, function and dependencies of the last successful commit, and the next
successful render applies the new value.

A binding also re-evaluates on its own when a state it reads changes. That
update is a separate commit, not part of any component's render. If the owning
component's render fails for the same state change, the binding still shows the
new value:

```tsx
function Counter() {
  const count = state(1);
  if (count() === 2) throw new Error('boom');
  return (
    <p>
      <b>{() => count()}</b> <i>{count()}</i>
    </p>
  );
}
// After count.set(2): <b>2</b> <i>1</i>; the render rolled back, the binding did not.
```

Read the state in the render instead of a binding when a value must change
together with the rest of the component's output.

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

In a mixed parent, an empty or newly emptied `For` also preserves the first
following sibling as its reconciliation cursor. Later static nodes, components,
and control boundaries are updated in place instead of being duplicated,
reordered, or remounted. This applies equally to accessor-backed collections
and parents that contain portal writers.

When a keyed row renders a transparent component range, the row continues to
follow the component's current owned range after reactive resource, portal, or
result updates. Parent reconciliation preserves that live range and its editor
or widget identity instead of restoring a stale pre-update range. Cleanup
ownership remains balanced when the row is later replaced or removed.

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

### Attributes written by other code

Askr only removes what it rendered. On re-render, props are diffed against the
props Askr last applied to that element, not against the live DOM, so
attributes, class tokens and inline style properties added by other code
survive: a focus trap setting `aria-hidden` or `inert`, an animation library
setting `style.transform`, a tooltip adding `data-*`, or `classList.add(...)`.

- A prop that disappears (or becomes `null`/`undefined`/`false`) removes only
  what Askr wrote for it: the attribute, its own class tokens, or its own style
  properties.
- Values Askr still renders are re-applied if other code overwrote them (for
  example a removed class token or a changed `title`).
- Server-rendered markup that hydration cannot adopt as-is is treated as
  Askr-owned on its first update, so mismatched SSR attributes are still
  cleaned up.

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
to an HTML string. This synchronous helper does not run route loaders, and it
throws `SSRAccessDecisionError` for auth or policy redirects and denials instead
of rendering them; use `renderRouteRequest()` for routes with loaders or when
the server needs the redirect or deny result (see the [SSR Guide](../guides/ssr.md)).

To keep route handlers app-only, pass a `document` callback that wraps the
rendered app HTML into a full document:

```tsx
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

### Text inside `<script>` and `<style>`

The HTML parser does not decode entities inside HTML `<script>` and `<style>`
elements, so SSR writes their text children verbatim instead of
entity-escaping them. CSS such as `ul > li` and scripts such as
`a < b && c > d` reach the browser unchanged and match the text the client
renderer creates, so hydration adopts the element in place.

Only characters that could let markup form are rewritten, case-insensitively,
over the concatenated text of all children, so a sequence split across children
is caught:

- In `<style>`, every `<` is written as the CSS escape `\3c ` (the space ends
  the escape). No markup can form, whatever context the parser reads the text
  in. Inside CSS strings, `url()`, and comments the escape denotes `<`.
- In `<script>`, every `</` becomes `<\/`, so no closing tag of the script or
  of any ancestor can form, and the `<` of `<script` and `<!--` is written as
  `\u003C`. Inside JavaScript string, template, and regular-expression
  literals, and inside JSON strings (`type="application/json"`, `importmap`,
  `application/ld+json`), these rewrites denote the original characters, so
  the content stays valid.

Some text has no safe raw form, so it does not survive unchanged:

- In scripts, `</`, `<!--`, and `<script` outside a string, template, or
  regular-expression literal may change meaning or become a syntax error.
  Keep them inside literals, where the rewrites are exact.
- In styles, a `<` outside strings, `url()`, and comments reads back as an
  escaped identifier instead of `<`. This affects custom property values that
  contain `<` and range media queries such as `@media (width < 600px)`; write
  those as `(max-width: 599.98px)` or `(600px > width)` instead.

Raw text is written only for an HTML `<script>` or `<style>` whose ancestors
are all ordinary HTML content. Otherwise SSR keeps the text entity-escaped:

- Inside `<svg>` and `<math>` (foreign content), `<script>` and `<style>` are
  ordinary elements whose text the parser reads as markup. HTML integration
  points such as SVG `<foreignObject>`, `<desc>`, and `<title>`, MathML
  `<annotation-xml>` with an HTML `encoding`, and MathML text elements (`<mi>`,
  `<mo>`, `<mn>`, `<ms>`, `<mtext>`) return their children to HTML.
- Inside `<select>`, including its `<option>` and `<optgroup>` children, the
  parser ignores a `<style>` start tag and reads its text as markup, so
  `<style>` text stays escaped. `<script>` is still parsed as a script there,
  and `<template>` content returns to ordinary HTML.
- Inside an element whose content the parser reads as text (`<noscript>`,
  `<iframe>`, `<xmp>`, `<noembed>`, `<noframes>`, `<textarea>`, `<title>`,
  `<plaintext>`), a nested `<script>` or `<style>` is not an element at all,
  and raw content could close the ancestor.

Portal content follows the context of the host it renders at.

Children of `<script>` and `<style>` may be strings, numbers, fragments,
components that return text, `Show`/`For`/`Case` boundaries, and error
boundaries. Function children render nothing on the server, as they do in any
other element. Element children throw during SSR, because they have no raw
text form. `dangerouslySetInnerHTML` is still written as given and is not
rewritten.

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
