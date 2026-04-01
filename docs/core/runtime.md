# Core: Runtime

The Askr runtime handles application mounting, lifecycle, and teardown.

## Application modes

Askr supports three rendering modes. You choose the mode when you boot the application.

| Mode            | API              | Use case                                  |
| --------------- | ---------------- | ----------------------------------------- |
| Island          | `createIsland()` | Single mounted component in a larger page |
| SPA             | `createSPA()`    | Full client-rendered app with router      |
| SSR + hydration | `hydrateSPA()`   | Server-rendered HTML hydrated on client   |

## Island mode

Use islands to add interactivity to a specific part of a page.

```ts
import { createIsland } from '@askrjs/askr';
import Counter from './counter';

createIsland(Counter, document.getElementById('counter-root'), {
  initialCount: 0,
});
```

`createIsland()` mounts the component once and manages its lifecycle until the container
is removed from the DOM.

## SPA mode

Use `createSPA()` for a full client-rendered application with the Askr router.

```ts
import { createSPA } from '@askrjs/askr';
import './router'; // registers routes via registerRoutes(), group(), and route()

createSPA(document.getElementById('app'));
```

Routes must be registered before `createSPA()` is called.

## SSR + SPA hydration

Server renders to HTML string. Client hydrates with matching route state.

```ts
// server
import { renderToString } from '@askrjs/askr/ssr';
const html = renderToString({ url: req.url });

// client
import { hydrateSPA } from '@askrjs/askr';
hydrateSPA(document.getElementById('app'));
```

## Cleanup

```ts
import { cleanupApp, hasApp } from '@askrjs/askr';

if (hasApp()) {
  cleanupApp();
}
```

## See also

- [Routing](./routing.md)
- [Rendering](./rendering.md)
- [API reference](../reference/api.md)
- [Boot subpath](../reference/api.md)
