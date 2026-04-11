# API Overview

Askr treats the published package entrypoints as the public API contract.

Use explicit subpaths by default. Startup belongs in `@askrjs/askr/boot`, runtime primitives in `@askrjs/askr`, and subsystem APIs in their dedicated entrypoints.

## Root package (`@askrjs/askr`)

- Runtime primitives: `state(initialValue)`, `derive(selector) -> getter`, `derive(source, map) -> getter`, `selector(source, equals?) -> keyed predicate`
- Context/resources: `defineContext`, `readContext`, `resource`, `getSignal`
- Common helpers: `For`, `route`, `navigate`, `Link`, JSX runtime exports

Supported DOM events are delegated automatically as part of the renderer; normal app code does not need a separate event-delegation API.

## Preferred subpath packages

- `@askrjs/askr/boot` -> startup entrypoint (`createIsland`, `createIslands`, `createSPA`, `hydrateSPA`, `cleanupApp`, `hasApp`)
- `@askrjs/askr/router` -> routing entrypoint (`route`, `registerRoute`, `getRoutes`, `clearRoutes`, namespace helpers, `navigate`, `Link`, `layout`, route types)
- `@askrjs/askr/resources` -> resource and operation primitives (`resource`, `getSignal`, `on`, `timer`, `task`, `stream`, `capture`)
- `@askrjs/askr/fx` -> timing and scheduling utilities (`debounce`, `throttle`, `retry`, `defer`, event helpers, `scheduleEventHandler`)
- `@askrjs/askr/ssr` -> server-side rendering helpers
- `@askrjs/askr/ssg` -> static-site generation helpers (`createStaticGen`)
- `@askrjs/askr/for`, `@askrjs/askr/foundations` -> lower-level framework primitives

## Import style

Use subpath imports for feature-specific APIs. Keep startup imports in `@askrjs/askr/boot`.

```ts
import { state } from '@askrjs/askr';
import { createIsland, createSPA } from '@askrjs/askr/boot';
import { registerRoute } from '@askrjs/askr/router';
import { resource, on } from '@askrjs/askr/resources';
import { debounce } from '@askrjs/askr/fx';
import { createStaticGen } from '@askrjs/askr/ssg';
```

For router-specific code beyond `route()` and `navigate()`, prefer `@askrjs/askr/router`.

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

`createSPA({ routes })` is the authoritative boot input. For explicit router management, use `registerRoute(...)` plus `getRoutes()` from `@askrjs/askr/router`.

`@askrjs/askr/ssg` also accepts `parallelism?: number | 'auto'`, and the Vite plugin accepts `optimizeTemplates?: boolean` for opt-in compile-time literal hoisting.

## Next

- [Router API](router.md)
- [Resources API](resources.md)
- [FX API](fx.md)
- [SSG Guide](../guides/ssg.md)
