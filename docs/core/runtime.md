# Core: Runtime

The Askr runtime handles application mounting, lifecycle, and teardown.

## Application modes

Askr supports three rendering modes. You choose the mode when you boot the application.

| Mode            | API                                 | Use case                                  |
| --------------- | ----------------------------------- | ----------------------------------------- |
| Island          | `createIsland({ root, component })` | Single mounted component in a larger page |
| SPA             | `createSPA({ root, registry })`     | Full client-rendered app with router      |
| SSR + hydration | `hydrateSPA({ root, registry })`    | Server-rendered HTML hydrated on client   |

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

`createRouteRegistry()` is the public authoring boundary. The registry owns the
normalized route data used internally; callers should pass that same registry
to the boot, SSR, SSG, and testing APIs.

## SSR + SPA hydration

Server renders to HTML string. Client hydrates with matching route state.

```tsx
// server
import { renderToString } from '@askrjs/askr/ssr';
import { registry } from './routes';

const html = renderToString({ url: req.url, registry });

// client
import { hydrateSPA } from '@askrjs/askr/boot';

await hydrateSPA({ root: 'app', registry });
```

The component render phase remains synchronous. Critical route-loader data is
awaited first; `defer()` explicitly marks non-critical promises that may stream
after fallback HTML. Async components and async `resource()` work during SSR
still throw instead of being awaited.

## Runtime boundary

The public runtime exposes `createRuntime()` and `getDefaultRuntime()`. Core implementation modules route
default scheduler and renderer access through the internal runtime access
boundary so hot paths do not import singleton globals directly.

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
