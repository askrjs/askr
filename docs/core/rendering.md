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
fine-grained binding. A binding always shows the current value of the state it
reads. A failed render never leaves it stale: the render's own output rolls
back to the last commit, while its bindings keep tracking state, including
changes made in the same flush as the failure.

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
// After count.set(2): <b>2</b> <i>1</i>. The render rolled back; the binding
// reflects the state.
```

The rule covers structural function children too, such as a list whose
length follows state (`{() => Array.from({ length: n() }, ...)}`), inside an
element or in a component's fragment or array result. It also covers a child
component that re-renders on its own state: when that update joined a parent
render that failed, the child renders again after the rollback. A failed render
does not wait for the next state change to bring either of them up to date.
That catch-up render uses the child's last committed props with its current
state. If it throws, its error is reported alongside the original one (an
`AggregateError`, see [Update loop guard](./runtime.md#update-loop-guard)).

Known limitation: after `hydrateSPA`, a structural function child with keyed
items in a component's fragment or array result does not update when its
state changes, whether or not a render failed. Unkeyed items, and structural
function children inside an element, update as described above.

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

When a component returns a fragment or array containing child components,
updating the parent with new props keeps each child's state and DOM node as
long as its type and key still match. The same ownership applies to children
inside nested fragments and to server nodes adopted during hydration. Change a
child's key when it should start with fresh state.

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

### Attributes and DOM properties

Intrinsic props render as attributes, so SSR can serialize them and hydration
can compare them. Form state is also synced to the live property: `value`,
`checked` and `selected`. A few more props are written as DOM properties
because their attribute does not control the live state:

| Prop            | Element             | Written as                                    | SSR             |
| --------------- | ------------------- | --------------------------------------------- | --------------- |
| `muted`         | `<video>`/`<audio>` | `el.muted` and the `muted` attribute          | renders `muted` |
| `indeterminate` | `<input>`           | `el.indeterminate` only                       | not rendered    |
| object/array    | custom elements     | `el[name]` (primitive values stay attributes) | not rendered    |
| `prop:name`     | any                 | `el.name`, assigned as-is (including `false`) | not rendered    |
| `attr:name`     | any                 | the `name` attribute, never a property        | renders `name`  |

```tsx
function Media(props: { muted: boolean; stream: MediaStream; rows: Row[] }) {
  return (
    <>
      <video muted={props.muted} prop:srcObject={props.stream} />
      <input type="checkbox" indeterminate={() => someChecked()} />
      <data-grid rows={props.rows} attr:theme="dark" />
    </>
  );
}
```

Form state props accept a function or cell like any other prop, and the
binding keeps the live property in sync: `value={() => name()}` on an
`<input>` or `<textarea>`, `checked={() => on()}`, `selected={() => on()}`
on an `<option>`, and `value={() => role()}` on a `<select>` (an array for
`multiple`). A `<select>` value is applied again after the select's own
children are created or updated, so options written directly inside it can
come from the same render. Options rendered by a `For` or a function child
are not tracked: the value is not re-applied when only they change, so keep a
value's option rendered before selecting it.

```tsx
function RolePicker() {
  const role = state('admin');
  return (
    <select
      value={() => role()}
      onChange={(event: Event) =>
        role.set((event.currentTarget as HTMLSelectElement).value)
      }
    >
      <option value="viewer">Viewer</option>
      <option value="admin">Admin</option>
    </select>
  );
}
```

Values SSR cannot render are applied when the client hydrates. Attributes a
property reflects (`prop:href` sets `href`, `prop:hidden` sets `hidden`) are
kept on re-render like any other attribute Askr rendered.

When one of these props is removed, Askr puts the property back to its
default: `muted` and `indeterminate` become `false`; a property that reflects
to an attribute has that attribute removed; an own property (an expando, or a
value set before a custom element upgraded) is deleted; other string
properties become `''` and booleans `false`. Numeric properties with no
attribute (`prop:volume`) keep their last value. A failed commit rolls
property writes back with the rest of the element.

URL attributes are checked the same way on the client and in SSR. `href`,
`action`, `formAction` and `xlink:href` render only relative URLs or the
`http`, `https`, `mailto`, `sms` and `tel` schemes. `src` and `data` render
any URL except a script scheme (`javascript:`, `vbscript:`). The scheme is
read case-insensitively after trimming the value and removing ASCII spaces
and control characters (U+0000-U+0020, U+007F-U+009F) anywhere in it, so
`java\tscript:` is still a script URL. A non-string value is converted to
text once, and that text is both checked and written.

A blocked value, such as a custom `vscode:` or `slack:` link in `href`, is
omitted. In development Askr logs a warning naming the attribute and the
blocked scheme, once per attribute and value; production omits it silently.
To link to a trusted custom scheme, leave the `href` prop off and set the
attribute from a ref. Askr does not remove attributes it did not render:

```tsx
<a ref={(el) => el?.setAttribute('href', 'vscode://file/src/app.ts')}>
  Open in VS Code
</a>
```

The escape hatches keep the usual guards:

- URL properties (`href`, `src`, `action`, `formAction`, `data`) are checked
  after converting the value to a string, so a `URL` object or any value with
  a `javascript:` `toString()` is dropped. Built-in elements receive the
  checked string, so a `toString()` cannot change its answer after the
  check. A blocked value also clears the property it replaces.
- `attr:` URL attributes keep the attribute URL guard, `attr:on*` never
  renders an inline handler, and `attr:` values must be text: objects
  (including `attr:style={{...}}`) are not rendered on either side.
- `prop:innerHTML`, `prop:outerHTML` and `prop:srcdoc` are ignored (use
  `dangerouslySetInnerHTML`), as are `prop:__proto__`, `prop:constructor` and
  `prop:prototype`.

Custom element properties are assigned even if the element is not defined
yet, as Lit's `.prop` bindings do. Until the element upgrades, the value is an
own property that shadows the class's accessor, so an element that may be
defined after it renders should re-read such properties in its constructor
(the "lazy properties" pattern), or be defined before Askr renders it.

A function value is still a reactive binding, so pass a callback property as
`prop:onSelect={() => handler}`. The binding's result is assigned as-is, even
a cell: `prop:source={() => cell}` passes the cell, not its value.

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

### Reactive values on the server

Function children and props, and `state` or `derive` cells passed as children
or props, are reactive on the client. The server
calls each one once, without subscribing to what it reads, and renders the
current value exactly as a static child or prop with that value: text is
escaped, elements and arrays render as markup, and `null`, `undefined`, and
`false` render nothing. Hydration therefore finds the same text and attributes
and adopts the nodes in place, then keeps them reactive. Event handlers
(`on*`) and `ref` are never called.

```tsx
function Greeting() {
  const name = state('Ada');
  return <p title={() => `Hello ${name()}`}>{name}</p>;
}
// SSR: <p title="Hello Ada">Ada</p>
```

A function child may return a cell, which is read in turn, so
`{() => (useFull() ? fullName : shortName)}` renders, and on the client
follows, whichever cell is selected. Only that one level is read: any other
function in a function child's result (returned directly, or inside an array
or fragment it returns) renders nothing, and so does a component that returns
a function or a cell. Elements a function child returns keep their own
reactive children and props.

A function prop follows the same rule: `title={() => (useFull() ? fullName :
shortName)}` renders the selected cell's value on the server and the client,
and the client binding follows both the choice and the chosen cell.
`prop:` is the exception: it assigns the function's result as-is, so
`prop:source={() => cell}` hands the cell itself to a custom element.

Function children are not limited to elements. A function or cell among the
items of a fragment or array a component returns, such as a layout that
renders `<>{props.children}</>`, a function child of `ErrorBoundary`, and a
function child of `Portal` render and update the same way. Both renderers
follow these rules, so server markup and client output agree.

A function child may use what a component body uses: hooks such as
`state()`, `resource()`, `task()` and `watch()`; `Show`, `For` and `Case`;
and `readScope()`, which sees the providers around the position the function
was written in (including a provider rendered by a wrapper component around
it). The server renders every function child as a small component
(`FunctionChild`). The client does the same among fragment, array,
`ErrorBoundary` and `Portal` children. Inside an element, a function child
that only reads values is bound straight to the DOM with no component; the
first time a run asks for a component (a hook, `Show`/`For`/`Case`, a
resource), that run is abandoned and the element's function children become
`FunctionChild` components from then on. That first read runs again as the
component, so code before the first hook can run twice: once on mount (or on
the run that first reaches a hook) and again after the upgrade. Keep side
effects out of that part of the function.

Either way, hooks run in the function's call order, keep their state across
re-runs and run lifecycle work. When a run calls a different sequence of
hooks than the last one, for example `{() => (open() ? <Show .../> : 'none')}`
or a `state()` called only in one branch, the function child remounts: its
previous hooks are disposed (their cleanups run before the new run's
`task()` work) and it starts again with
fresh state, instead of reporting a hook-order error as a component body
does. A remount also recreates the DOM the function child rendered, so an
element inside it that had focus loses it; keep inputs outside a function
child whose hooks change, or give it the same hooks on every run.

```tsx
<Theme value="dark">
  <p>{() => readScope(Theme)}</p>
  <div>
    {() => (
      <Show when={open} fallback={<em>closed</em>}>
        <For each={items} by={(item) => item.id}>
          {(item) => <Row item={item} />}
        </For>
      </Show>
    )}
  </div>
</Theme>
```

A function child or prop that throws is a render error on both sides: the
nearest `ErrorBoundary` renders its fallback, and without one the render (or
the client update) throws.

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
boundaries, and function or readable children, which contribute their
current value. Element children throw during SSR, because they have no raw
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
and around default-portal host content. Hydration adopts the host range in
place, including when an explicit host precedes its writer or has no content.
The anchors keep adjacent application nodes in position without a visible
wrapper element. Unused or explicitly suppressed automatic hosts are omitted.

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
