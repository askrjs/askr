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

## When work becomes observable

Askr uses signals internally, but its public primitives become observable at
different lifecycle boundaries. Use this table when composing production code
and when choosing a test wait:

| Operation | First observable point | Test contract |
| --- | --- | --- |
| `state.set()` / `derive()` | The scheduled reactive render and DOM commit | Flush the Askr scheduler, then assert visible DOM. |
| `resource()` | Its loader starts for the owning render; fulfilled state publishes through a later scheduled commit | Await the transport and flush the scheduler, or assert through a real mounted surface. |
| `task()` | After the owning component commits | It runs once per committed mount, not once per rerender. Await returned async work when the assertion depends on it. |
| `navigate()` | After route resolution and the destination lifecycle commit | Assert both the committed URL and destination DOM. Mocking `navigate()` proves invocation only. |

A `task()` may call `navigate()` during its commit. That reentrant navigation
supersedes the route whose commit triggered it; the final URL and mounted DOM
must both belong to the winning destination. Test mount-time redirects through
`renderRoute()` or a real browser route. A unit test that replaces `navigate`
with a mock cannot detect scheduler, ownership, rollback, or DOM/URL divergence.

Microtasks and timers are application scheduling choices, not implicit Askr
flushes. Await a microtask or timer only when the application code explicitly
uses that boundary; otherwise use the scheduler or routed-render test helper
that corresponds to the public operation above.

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
