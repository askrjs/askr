# API Overview

Askr keeps the root API minimal and exposes advanced features through explicit subpaths.

## Root package (`@askrjs/askr`)

- `createIsland(config)`
- `createSPA(config)`
- `state(initialValue)`
- `derive(selector)`
- `derive(source, map)`
- `For(...)`
- Event delegation controls (`enableEventDelegation`, `disableEventDelegation`, `isEventDelegationEnabled`, `setGlobalDelegationContainer`)

## Subpath packages

- `@askrjs/askr/router` -> routing primitives (`route`, `getRoutes`, `clearRoutes`, `navigate`, `Link`, `layout`)
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

## Next

- [Router API](router.md)
- [Resources API](resources.md)
- [FX API](fx.md)
- [SSG Guide](../guides/ssg.md)
