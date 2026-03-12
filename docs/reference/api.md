# API Overview

Askr treats the published package entrypoints as the public API contract.

Use the root package for common app/runtime APIs. Prefer explicit subpaths when you are working primarily inside a specific subsystem such as routing, resources, or FX.

## Root package (`@askrjs/askr`)

- App/runtime: `createIsland`, `createIslands`, `createSPA`, `hydrateSPA`, `cleanupApp`, `hasApp`
- Reactivity: `state(initialValue)`, `derive(selector) -> getter`, `derive(source, map) -> getter`, `selector(source, equals?) -> keyed predicate`
- Operations: `resource`, `on`, `timer`, `task`, `stream`, `capture`
- Common helpers: `For`, FX utilities, SSR helpers, JSX runtime exports
- Supported router compatibility exports: `route`, `navigate`, `Link`, `getRoutes`, `clearRoutes`, `registerRoute`, `defineRoute`, namespace helpers, and `setServerLocation`

Supported DOM events are delegated automatically as part of the renderer; normal app code does not need a separate event-delegation API.

## Preferred subpath packages

- `@askrjs/askr/router` -> preferred router entrypoint (`route`, `getRoutes`, `clearRoutes`, `navigate`, `Link`, `layout`, route types)
- `@askrjs/askr/resources` -> async resource primitives (`resource`, `getSignal`)
- `@askrjs/askr/fx` -> timing and scheduling utilities (`debounce`, `throttle`, `retry`, `defer`, etc.)
- `@askrjs/askr/ssr` -> server-side rendering helpers
- `@askrjs/askr/ssg` -> static-site generation helpers (`createStaticGen`)
- `@askrjs/askr/for`, `@askrjs/askr/foundations` -> lower-level framework primitives

## Import style

Use root imports for common app code and subpath imports when you need feature-specific APIs.

```ts
import { createIsland, state } from '@askrjs/askr';
import { route, navigate } from '@askrjs/askr/router';
import { resource } from '@askrjs/askr/resources';
import { createStaticGen } from '@askrjs/askr/ssg';
```

For router-specific code, prefer `@askrjs/askr/router`. The root barrel keeps router helpers available for compatibility and shared convenience imports.

`derive()` returns a callable getter. Example:

```ts
import { derive, state } from '@askrjs/askr';

const count = state(0);
const doubled = derive(() => count() * 2);
console.log(doubled());
```

`selector()` returns a keyed predicate. Example:

```ts
import { selector, state } from '@askrjs/askr';

const selectedId = state<number | null>(null);
const isSelected = selector(selectedId);

console.log(isSelected(42));
```

For large keyed lists, call `selector()` once in the owner component and pass the returned predicate to child rows instead of creating a new selector per item.

`route()` is overloaded:

- `route(path, handler, namespace?)` registers a route
- `route()` inside render returns the current read-only route snapshot

`createSPA({ routes })` is the authoritative boot input. `route(...)` plus `getRoutes()` is the convenience way to assemble that route table for SPA startup.

`@askrjs/askr/ssg` also accepts `parallelism?: number | 'auto'`, and the Vite plugin accepts `optimizeTemplates?: boolean` for opt-in compile-time literal hoisting.

## Next

- [Router API](router.md)
- [Resources API](resources.md)
- [FX API](fx.md)
- [SSG Guide](../guides/ssg.md)
