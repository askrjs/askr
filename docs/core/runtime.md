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
Calling it again with a different component at the same root ends the old
island lifetime, runs its cleanup, and mounts the new component. If cleanup
mounts another island at that root, that replacement takes precedence.

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

## Reactive primitives

`state()`, `derive()` and `selector()` are positional component hooks. They
share one change rule: a new value that is `Object.is`-equal to the current one
does not notify anyone.

### Custom equality

`state(initial, { equals })` and `derive(fn, { equals })` (also
`derive(source, map, { equals })`) take a comparator `(a, b) => boolean`. When
it returns `true` the new value is treated as unchanged: a `state.set()` is
ignored, and a `derive()` that recomputes to an equal value does not notify its
readers. The comparator is not called for the first value. `selector(source,
equals)` already took a comparator as its second argument.

```ts
const point = state(
  { x: 1, y: 2 },
  { equals: (a, b) => a.x === b.x && a.y === b.y }
);
point.set({ x: 1, y: 2 }); // ignored

const bucket = derive(() => ({ b: Math.floor(n() / 10) }), {
  equals: (a, b) => a.b === b.b,
});
```

### Debug names

`state()`, `derive()`, `selector()` and `store()` accept `{ name }` in their
options (`selector(source, { equals, name })`; a bare comparator still works).
The name appears in diagnostics: the loop-guard error
(`exceeded MAX_FLUSH_DEPTH (50): a scheduled update "ticker" kept
re-queueing itself`, which also names a looping component by its display name),
the circular-dependency errors (`Circular reactive dependency detected in
"total"`, `derive("total") cannot read itself recursively`), the unused-state
warning, and a store's render-write error. A name has no other effect and there
is no devtools hook.

### Batching and untracked reads

`batch(fn)` runs `fn` with scheduling deferred and flushes once, synchronously,
when the outermost batch exits. It works anywhere, not only in components: in
event handlers (which already run in a batch), timers and promise callbacks.
Nested batches flush only when the outermost one exits. It returns `fn`'s
result, and queued work still flushes if `fn` throws.

`untrack(fn)` runs `fn` and returns its result without subscribing the running
render, `derive()` or binding to anything `fn` reads. There is no separate
`peek`: read a state getter inside `untrack()` instead.

```ts
import { batch, derive, state, untrack } from '@askrjs/askr';

function Form() {
  const first = state('');
  const second = state('');
  const name = state('');
  const count = state(0);

  setTimeout(() => {
    batch(() => {
      first.set('a');
      second.set('b');
    }); // one render
  }, 100);

  const label = derive(() => `${name()} (${untrack(() => count())})`);
  return <p>{label()}</p>;
}
```

### Stores

`store(initial)` is a component hook, like `state()`, that returns a deep
reactive proxy over a plain object or array. It claims a positional hook slot,
so call it unconditionally and in the same order on every render; the initial
value is used only on the first render and later calls return the same proxy.

```tsx
import { store, unwrap } from '@askrjs/askr';

function Todos() {
  const todos = store({
    filter: 'all',
    items: [{ title: 'Ship', done: false }],
  });

  const add = () => todos.items.push({ title: 'Test', done: false });
  const toggle = (index: number) => {
    todos.items[index]!.done = !todos.items[index]!.done;
  };
  const snapshot = () => JSON.stringify(unwrap(todos));

  return (
    <div title={todos.filter} onClick={snapshot}>
      <button onClick={add}>Add</button>
      <ul>
        {todos.items.map((item, index) => (
          <li onClick={() => toggle(index)}>{item.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

Contract:

- **Per-property tracking.** A property read inside a render, `derive()` or
  binding subscribes to that property only, through a signal created on its
  first tracked read. A component that reads `todos.filter` does not re-render
  when `todos.items` changes. Assigning a value that is `Object.is`-equal to the
  current one does nothing.
- **Nesting and identity.** Nested plain objects and arrays are wrapped lazily
  and the same target always yields the same proxy (`todos.items === todos.items`).
  Class instances, `Map`, `Set` and `Date` values are stored and returned
  as they are, without reactivity. Assigning a proxy stores its raw object.
- **Arrays.** `length` and each index are tracked individually, and `push`,
  `splice`, `pop`, `sort` and assignment notify the affected readers.
  Iteration (`for..of`, `map`, `forEach`, `filter` and the other walking
  methods) tracks the whole array, so it re-runs on any element change.
- **Keys.** `delete` notifies the readers of that property. `Object.keys()`,
  `for..in`, spread and the `in` operator subscribe to key additions and removals.
- **Writes.** A store write during render throws, like `state.set()`, and so does
  a write from inside `derive()` or `selector()`. Writes in handlers, timers and
  tasks are fine and coalesce like any other scheduled work (see `batch()`).
- **Raw access.** `unwrap(proxy)` returns the raw object. Mutating the raw
  object directly does not notify anyone, and `includes`/`indexOf` on a store
  array compare against proxies, so pass items read from the store.
- **SSR.** A store is plain data on the server: `renderToStringSync()` renders
  its reads normally and nothing is subscribed.

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

`watch(source, callback)` compares the value its single source returns with
`Object.is`, like `state()` and `derive()`, so a source that returns a new array
each time notifies even when the entries are equal. `watch([a, b], callback)`
(an array of sources) is the tuple form: the callback receives an array, and the
tuple is compared entry by entry. See
[`watch()`](../reference/resources.md#watchsource-callback).

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

Three guards stop work that would otherwise never finish. They behave the same
in development and production builds.

- **The same job repeats.** The scheduler counts how often each queued job runs
  in one flush. A job that runs more than 50 times (a component whose ref
  callback writes state it renders, a fine-grained binding that re-dirties
  itself, a `selector()` source that writes its own inputs) is treated as an
  update loop: the scheduler drops it, records an
  `exceeded MAX_FLUSH_DEPTH (50)` error with the other failures, and keeps
  draining the remaining queued work, so earlier failures are still reported and
  other queued work is not stranded. Dropping a job clears its owner's pending
  flag (unless another copy of it is still queued), so a later write schedules
  it again: a component re-renders on its next state change. A `watch()` runs
  under a slightly lower limit and reports a reactive-cycle error to its owning
  error boundary instead.
- **Fresh closures.** A task queued from `queueTask()` (or anything that queues
  a new job object each time) has no identity to count, so a task that queues
  a new closure on every run is caught by a total instead. A flush may run
  100,000 jobs beyond the ones that were queued when it started; past that, the
  scheduler stops the flush, drops the work still queued (computations stay
  stale and are scheduled again by their next change) and reports
  `exceeded 100000 follow-up jobs`. Flushing many jobs at once is not limited:
  the total is measured against the number queued at the start.
- **Derived values.** A `derive()` whose computation writes state that
  re-dirties itself, directly or through another derive or effect, is skipped
  after 50 recomputes in one flush and reported as `derive() exceeded 50 runs`.
  The skipped entry stays dirty and recomputes on its next read. Reads between
  flushes (an event handler that writes and reads a derive in a loop) are not
  counted.

Unrelated dirty entries in the same flush still run. There is no `onError`
hook: failures are collected and thrown after the flush, or delivered to an
error boundary where noted above.

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
