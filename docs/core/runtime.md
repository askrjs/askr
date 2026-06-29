# Core: Runtime

The Askr runtime handles application mounting, lifecycle, and teardown.

## Application modes

Askr supports three rendering modes. You choose the mode when you boot the application.

| Mode            | API                                 | Use case                                  |
| --------------- | ----------------------------------- | ----------------------------------------- |
| Island          | `createIsland({ root, component })` | Single mounted component in a larger page |
| SPA             | `createSPA({ root, manifest })`     | Full client-rendered app with router      |
| SSR + hydration | `hydrateSPA({ root, manifest })`    | Server-rendered HTML hydrated on client   |

## Island mode

Use islands to add interactivity to a specific part of a page.

```ts
import { createIsland } from '@askrjs/askr/boot';
import Counter from './counter';

createIsland({ root: 'counter-root', component: Counter });
```

`createIsland()` mounts the component once and manages its lifecycle until the container
is removed from the DOM.

## SPA mode

Use `createSPA()` for a full client-rendered application with the Askr router.

```ts
import { createSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route } from '@askrjs/askr/router';

const registry = createRouteRegistry(() => {
  route('/', () => <Home />);
});

await createSPA({ root: 'app', registry });
```

Create the route registry before `createSPA()` is called.

## SSR + SPA hydration

Server renders to HTML string. Client hydrates with matching route state.

```tsx
// server
import { renderToString, type SSRRoute } from '@askrjs/askr/ssr';

const routes: SSRRoute[] = [{ path: '/', handler: () => <Home /> }];
const html = renderToString({ url: req.url, routes });

// client
import { hydrateSPA } from '@askrjs/askr/boot';
import { registry } from './routes';

await hydrateSPA({ root: 'app', registry });
```

## Cleanup

```ts
import { cleanupApp, hasApp } from '@askrjs/askr/boot';

if (hasApp('app')) {
  cleanupApp('app');
}
```

## See also

- [Routing](./routing.md)
- [Rendering](./rendering.md)
- [API reference](../reference/api.md)
- [Boot subpath](../reference/api.md)
