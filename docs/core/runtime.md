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
import { renderRouteRequest } from '@askrjs/askr/ssr';
import { registry } from './routes';

const result = await renderRouteRequest({ url: req.url, registry });
// result.kind: 'render' | 'redirect' | 'deny' | 'no-match'

// client
import { hydrateSPA } from '@askrjs/askr/boot';

await hydrateSPA({ root: 'app', registry });
```

The component render phase remains synchronous. `renderRouteRequest()` awaits
critical route-loader data first; `defer()` explicitly marks non-critical promises that may stream
after fallback HTML. Async components and async `resource()` work during SSR
still throw instead of being awaited. The synchronous `renderToString({ url,
registry })` does not run route loaders and throws `SSRDataMissingError` for a
route that declares one.

## Runtime boundary

The construction-only `@askrjs/askr/experimental` subpath exposes
`createRuntime()` and `getDefaultRuntime()` for runtime and renderer maintainers.
Core implementation modules route default scheduler and renderer access through
the internal runtime access boundary so hot paths do not import singleton
globals directly.

`createRuntime()` constructs scheduler and renderer wiring only. Mounting uses
the default runtime; creating another runtime does not isolate mounted trees.
An omitted scheduler shares the default scheduler.

`createDOMRendererHost(configure)` constructs an adapter accepted by runtime
`renderer` options and `configureRenderer()`, without installing it. The callback
receives complete native `evaluation`, `cleanup`, `scopes`, `keys`, and
`reactivity` roles. Return all five roles and delegate explicitly where needed.
Later role and method replacement remains observable; callbacks receive their
role object as `this`. Legacy renderer hosts remain supported.

Component owners, child scopes, and reactive sources reach host callbacks as
opaque handles: compare them by identity and pass them back unchanged. The
handle, patching, and commit rules that renderer maintainers rely on are in
[Internals: Runtime extension boundary](../internals/runtime-extension-boundary.md).

## When work becomes observable

Askr uses signals internally, but its public primitives become observable at
different lifecycle boundaries. Use this table when composing production code
and when choosing a test wait:

| Operation                  | First observable point                                                                              | Test contract                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `state.set()` / `derive()` | The scheduled reactive render and DOM commit                                                        | Flush the Askr scheduler, then assert visible DOM.                                                                       |
| `resource()`               | Its loader starts for the owning render; fulfilled state publishes through a later scheduled commit | Await the transport and flush the scheduler, or assert through a real mounted surface.                                   |
| `task()`                   | After the owning component commits                                                                  | It runs once per committed mount, not once per rerender. Await returned async work when the assertion depends on it.     |
| `watch()`                  | After the owning component commits, then after a watched committed value changes                    | `flush()` reaches the initial callback and coalesced source observations. Await only async work started by the callback. |
| `navigate()`               | After route resolution and the destination lifecycle commit                                         | Assert both the committed URL and destination DOM. Mocking `navigate()` proves invocation only.                          |

A `task()` may call `navigate()` during its commit. That reentrant navigation
supersedes the route whose commit triggered it; the final URL and mounted DOM
must both belong to the winning destination. Test mount-time redirects through
`renderRoute()` or a real browser route. A unit test that replaces `navigate`
with a mock cannot detect scheduler, ownership, rollback, or DOM/URL divergence.
The same URL and DOM contract applies when `watch()` initiates navigation. If
the callback runs inside an active scheduler flush, routing begins at the next
microtask boundary so route rendering never performs a reentrant flush.

Microtasks and timers are application scheduling choices, not implicit Askr
flushes. Await a microtask or timer only when the application code explicitly
uses that boundary; otherwise use the scheduler or routed-render test helper
that corresponds to the public operation above.

## Update loop guard

A scheduler flush runs queued work until none remains. A task that throws is
consumed, the drain continues, and the flush rethrows the failure afterwards
(an `AggregateError` when several tasks failed, in execution order). The order
in which queued work runs is described in
[Runtime reactivity internals](../internals/runtime-reactivity.md#scheduler-lanes).

If the same scheduled task runs more than 50 times in one flush (for example a
component whose ref callback writes state it renders), the scheduler treats it
as an update loop: it drops that task, records an `exceeded MAX_FLUSH_DEPTH`
error with the other failures, and keeps draining the remaining queued work, so
earlier failures are still reported and other queued work is not stranded. Dropping a
task clears its owner's pending flag (unless another copy of it is still
queued), so a later write schedules it again: a component re-renders on its
next state change.

Reactive work that runs as a shared batch is guarded per entry instead, with
the same limit counted across every batch in the flush:

- A fine-grained effect that runs more than 50 times is skipped and reported
  once per flush through its `onError` (or the flush failures).
- A `derive()` or `selector()` whose computation writes state that re-dirties
  itself, directly or through another derive, selector or effect, is skipped
  after 50 recomputes and reported as `derive() exceeded 50 runs` or
  `selector() exceeded 50 runs`. The skipped entry stays dirty and
  recomputes on its next read.

Unrelated dirty entries in the same batch still run. A loop is caught when the
same task, component, effect, derived value or selector repeats. A task that
enqueues a new closure on every run is not detected.

Development builds count every run. Production builds count tasks, derived
values and selectors only once a flush has run 1000 of them (effects are
always counted), so flushes below that pay only a counter check. Past that
point each run costs a map entry, and a production loop runs roughly 1000 + 50
times before it fails instead of hanging the page.

## Cleanup

```ts
import { cleanupApp, hasApp } from '@askrjs/askr/boot';

if (hasApp('app')) {
  cleanupApp('app');
}
```

Cleanup always finishes: every ref, listener, reactive binding, and component
lifetime in the app is torn down even when one of them throws. What happens to
the failures depends on the app's `cleanupStrict` option:

- By default, `cleanupApp()` does not throw. Failures (a callback ref throwing
  when it receives `null`, a listener that cannot be removed, a throwing
  component cleanup function, a failing root cleanup callback) are reported
  with `reportError()` once the current task finishes, in development and
  production builds (see [teardown errors](./rendering.md#teardown-errors)).
- With `cleanupStrict: true`, `cleanupApp()` throws one `AggregateError` after
  cleanup finishes. It contains every failure, including those of components
  rendered inside `For`, `Show`, and `Case` at any depth, and none of them is
  also passed to `reportError()`. Failures during ordinary updates of a strict
  app (removed rows, replaced components, an `ErrorBoundary` fallback, a
  route change) are still reported rather than thrown, so an update is never
  interrupted.

Server rendering has no `reportError()`: a cleanup failure of a component
rendered on the server is thrown from the render call instead.

## See also

- [Routing](./routing.md)
- [Rendering](./rendering.md)
- [API reference](../reference/api.md)
- [Boot subpath](../reference/api.md)
