# API Overview

This page summarizes the public package entrypoints.

Use subpaths for feature-specific imports.

## Root package: `@askrjs/askr`

Common runtime exports:

- `state()`
- `derive()`
- `selector()`
- `defineContext()`
- `readContext()`
- `getSignal()`
- JSX runtime exports: `jsx`, `jsxs`, and `Fragment`

Public types:

- `State`
- `StateSetter`
- `StateTuple`
- `Derived`
- `Selector`
- `Context`
- `Props`
  The shared runtime props bag stays intentionally generic. Intrinsic JSX elements layer
  common DOM-style contracts such as `class`, `style`, `ref`, and high-use event handlers on top
  of it, and the JSX runtime gives high-use tags like `a`, `button`, `form`, `input`, `label`,
  `select`, `option`, and `textarea` plus common layout/content tags such as `div`, `span`,
  `section`, `main`, `article`, `header`, `footer`, `nav`, `p`, and headings, along with common
  semantic inline/content tags such as `blockquote`, `code`, `em`, `figure`, `figcaption`, `pre`,
  `small`, and `strong`, plus list, table, output, and common SVG tags such as `ul`, `li`, `ol`,
  `table`, `caption`, `thead`, `tbody`, `tfoot`, `tr`, `td`, `th`, `output`, `svg`, `g`,
  `circle`, `rect`, `path`, and `title`, their own attribute contracts, including table-cell
  props such as `colSpan`, `rowSpan`, `headers`, `scope`, and `abbr`, output props such as
  `htmlFor`, `name`, and `form`, and SVG props such as `viewBox`, `strokeWidth`,
  `strokeLinecap`, `strokeLinejoin`, `fillRule`, and `clipRule`. Compatibility props such as
  `className`, `htmlFor`, and those common camelCase SVG props are normalized to their rendered
  attribute names.

## Feature subpaths

- `@askrjs/askr/boot` - app startup and lifecycle helpers such as `createIsland`, `createIslands`, `createSPA`, `hydrateSPA`, `cleanupApp`, and `hasApp`
- `@askrjs/askr/components` - `ErrorBoundary`
- `@askrjs/askr/control` - JSX control-flow helpers
- `@askrjs/askr/data` - `createDataRuntime`, `getDefaultDataRuntime`, `createQuery`, `createMutation`, `invalidate`, and `invalidateOnInterval`
- `@askrjs/askr/testing` - test helpers such as `mockQuery`, `queryState`, and `createInvalidationRecorder`
- `@askrjs/askr/resources` - async resource helpers such as `resource`, `on`, `timer`, `task`, `capture`, `getSignal`, `routeActive`, `documentVisible`, and `windowFocused`, plus the current placeholder `stream` surface
- `@askrjs/askr/router` - route registration, routing state, and navigation helpers
- `@askrjs/askr/fx` - timing and scheduling helpers
- `@askrjs/askr/ssr` - server-side rendering helpers
- `@askrjs/askr/ssg` - static-site generation helpers
- `@askrjs/askr/foundations` - structural primitives such as `layout`, `Slot`, `Presence`, plus runtime-backed portal helpers like `definePortal`, `DefaultPortal`, and `Portal`
- `@askrjs/askr/foundations/structures` - structural registries and layering helpers such as `createCollection` and `createLayer`
- `@askrjs/askr/foundations/utilities` - prop composition and ID helpers
- `@askrjs/askr/foundations/interactions` - interaction-policy helpers
- `@askrjs/askr/foundations/state` - controllable-state helpers
- `@askrjs/askr/foundations/icon` - icon contract helpers
- `@askrjs/askr/jsx-runtime` - JSX factory exports plus `JSXElement`, `JSXComponent`, and `JSXElementType`
- `@askrjs/askr/jsx-dev-runtime` - JSX development runtime exports plus the same JSX public types

## Examples

```ts
import { derive, state } from '@askrjs/askr';

const [count, setCount] = state(0);
const doubled = derive(() => count() * 2);
setCount((value) => value + 1);
```

```ts
import { createSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route } from '@askrjs/askr/router';

const registry = createRouteRegistry(() => {
  route('/', () => <Home />);
  route('/about', () => <About />);
});

await createSPA({ root: document.body, registry });
```

## Migration Notes

- Move startup helpers like `createIsland`, `createIslands`, `createSPA`, `hydrateSPA`, `cleanupApp`, and `hasApp` to `@askrjs/askr/boot`.
- Move `ErrorBoundary` to `@askrjs/askr/components`.
- Move `createQuery`, `createMutation`, and `invalidate` to `@askrjs/askr/data`.
- Move `createCollection` and `createLayer` to `@askrjs/askr/foundations/structures`.
- Use the dedicated `@askrjs/askr/foundations/*` subpaths for utilities, interactions, state, and icon helpers.

## Notes

- `For`, `Show`, `Case`, and `Match` are available from `@askrjs/askr/control`.
- `Show` render-function children receive the resolved truthy value, and literal falsey branches are excluded from that callback type when TypeScript can see them.
- `Context.Scope` accepts normal renderable children or a zero-argument render callback. Imperative DOM `Node` children are not part of that public contract.
- `ErrorBoundary` fallbacks accept normal JSX boundary content, and the client runtime also allows an imperative DOM `Node` fallback when you need one.
- `Link`, `layout`, `Slot`, `Presence`, and the default portal surfaces accept normal renderable child content. Imperative DOM `Node` children are not part of that public contract.
- Router page components, `lazy()` route components, and router layout functions also return normal renderable content rather than imperative DOM `Node` values.
- `createQuery()` exposes `consistency` plus `staleReason` so settled stale states can be narrowed into `inconsistent`, `aborted`, or `error` without guessing from broad booleans alone.
- `createDataRuntime()` creates isolated query and mutation state for tests, embedded apps, and multi-root shells; pass it through data operation options with `runtime`.
- `resource()` is available from `@askrjs/askr/resources`.
- `renderToString()`, `renderToStream()`, `resolveRequest()`, and `createStaticGen()` accept route registries captured with `createRouteRegistry()`.
