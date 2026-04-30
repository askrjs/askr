# API Overview

This page summarizes the public package entrypoints.

Use subpaths for feature-specific imports.

## Root package: `@askrjs/askr`

Common runtime exports:

- `state()`
- `derive()`
- `selector()`
- `route()`
- `navigate()`
- `Link`
- JSX runtime exports

## Subpaths

- `@askrjs/askr/boot` - app startup helpers such as `createIsland`, `createIslands`, `createSPA`, and `hydrateSPA`
- `@askrjs/askr/router` - route registration and route-manifest helpers
- `@askrjs/askr/resources` - async resource helpers
- `@askrjs/askr/fx` - timing and scheduling helpers
- `@askrjs/askr/control` - JSX control-flow helpers
- `@askrjs/askr/ssr` - server-side rendering helpers
- `@askrjs/askr/ssg` - static-site generation helpers
- `@askrjs/askr/foundations` - canonical lower-level framework and shared UI primitives
- `@askrjs/ui/foundations` - compatibility entrypoint for the same shared foundations

## Examples

```ts
import { state, derive, selector } from '@askrjs/askr';

const [count, setCount] = state(0);
const doubled = derive(() => count() * 2);
const isSelected = selector(count);
```

```ts
import { createSPA } from '@askrjs/askr/boot';
import { getRoutes, route } from '@askrjs/askr/router';

route('/', () => <Home />);
createSPA({ root: document.body, routes: getRoutes() });
```

## Notes

- `For`, `Show`, `Case`, and `Match` are available from `@askrjs/askr/control`.
- `resource()` is available from `@askrjs/askr/resources`.
- `createStaticGen()` is available from `@askrjs/askr/ssg`.
