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

## Feature subpaths

- `@askrjs/askr/boot` - app startup and lifecycle helpers such as `createIsland`, `createIslands`, `createSPA`, `hydrateSPA`, `cleanupApp`, and `hasApp`
- `@askrjs/askr/components` - `ErrorBoundary`
- `@askrjs/askr/control` - JSX control-flow helpers
- `@askrjs/askr/data` - `createQuery`, `createMutation`, and `invalidate`
- `@askrjs/askr/resources` - async resource helpers such as `resource`, `on`, `timer`, `task`, `capture`, and `getSignal`, plus the current placeholder `stream` surface
- `@askrjs/askr/router` - route registration, routing state, and navigation helpers
- `@askrjs/askr/fx` - timing and scheduling helpers
- `@askrjs/askr/ssr` - server-side rendering helpers
- `@askrjs/askr/ssg` - static-site generation helpers
- `@askrjs/askr/foundations` - slim structural primitives such as `layout`, `Slot`, `Presence`, `definePortal`, `DefaultPortal`, and `Portal`
- `@askrjs/askr/foundations/structures` - structural registries and layering helpers such as `createCollection` and `createLayer`
- `@askrjs/askr/foundations/utilities` - prop composition and ID helpers
- `@askrjs/askr/foundations/interactions` - interaction-policy helpers
- `@askrjs/askr/foundations/state` - controllable-state helpers
- `@askrjs/askr/foundations/icon` - icon contract helpers
- `@askrjs/askr/jsx-runtime` - JSX factory exports
- `@askrjs/askr/jsx-dev-runtime` - JSX development runtime exports

## Examples

```ts
import { derive, state } from '@askrjs/askr';

const [count, setCount] = state(0);
const doubled = derive(() => count() * 2);
setCount((value) => value + 1);
```

```ts
import { createSPA } from '@askrjs/askr/boot';
import { getManifest, registerRoutes, route } from '@askrjs/askr/router';

registerRoutes(() => {
  route('/', () => <Home />);
  route('/about', () => <About />);
});

await createSPA({ root: document.body, manifest: getManifest() });
```

## Migration Notes

- Move startup helpers like `createIsland`, `createIslands`, `createSPA`, `hydrateSPA`, `cleanupApp`, and `hasApp` to `@askrjs/askr/boot`.
- Move `ErrorBoundary` to `@askrjs/askr/components`.
- Move `createQuery`, `createMutation`, and `invalidate` to `@askrjs/askr/data`.
- Move `createCollection` and `createLayer` to `@askrjs/askr/foundations/structures`.
- Use the dedicated `@askrjs/askr/foundations/*` subpaths for utilities, interactions, state, and icon helpers.

## Notes

- `For`, `Show`, `Case`, and `Match` are available from `@askrjs/askr/control`.
- `resource()` is available from `@askrjs/askr/resources`.
- `createStaticGen()` is available from `@askrjs/askr/ssg`.
