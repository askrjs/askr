# Resources API Reference

Import from `@askrjs/askr/resources`.

Query and mutation helpers live in `@askrjs/askr/data`.

## Resource helpers

The resources subpath owns `resource()`, `watch()`, `on()`, `timer()`, `task()`,
`stream()`, `capture()`, `getSignal()`, `routeActive()`, `documentVisible()`, and
`windowFocused()`.

### `resource(loader, deps)`

Runs async work with lifecycle awareness and dependency tracking.

- `loader`: function receiving `{ signal }` and returning either a value or a promise-like value
- `deps`: dependency list that controls re-execution

Returns an object with:

- `value`
- `pending`
- `error`
- `refresh()`

Example:

```ts
const user = resource(async ({ signal }) => {
  const res = await fetch('/api/user', { signal });
  return res.json();
}, []);

if (user.pending || !user.value) return 'loading';
if (user.error) return 'failed';
return user.value.name;
```

### `getSignal()`

Returns the current `AbortSignal` for cancellable async operations.

This is most useful during component render or when you need access to the
current component's signal outside a `resource()` loader. For resource loaders,
prefer the `{ signal }` argument passed into the loader itself.

Use it with platform APIs:

```ts
const res = await fetch('/api/data', { signal: getSignal() });
```

### `stream(source, options?)`

`stream()` owns an async iterable for the lifetime of its component. The source
is started after the first committed client mount and receives an
`AbortSignal`; it is never opened during SSR/SSG.

```ts
import { stream } from '@askrjs/askr/resources';

declare function connectToCountStream(input: {
  cursor: string;
  signal: AbortSignal;
}): AsyncIterable<number>;

function LiveCount({ cursor }: { cursor: string }) {
  const count = stream(
    ({ signal }) => connectToCountStream({ cursor, signal }),
    { deps: [cursor], initialValue: 0 }
  );

  return <output data-status={count.status}>{count.value ?? 'connecting'}</output>;
}
```

The result object has stable identity and exposes:

- `value`: the latest item, including an explicitly supplied `null` value
- `status`: `connecting`, `connected`, `reconnecting`, `closed`, or `error`
- `pending`: `true` only while connecting without a retained value
- `stale`: `true` while a retained value is not from the current live generation
- `error`: the latest non-abort error, or `null`
- `restart()`: aborts the current generation and starts a new one
- `close()`: aborts the current generation and remains closed until `restart()`

Dependency entries use shallow `Object.is` comparison. Changing `deps` restarts
an active stream; changing only the source function does not. The adapter owns
cursor resume, deduplication, gap recovery, retry, and backoff policy. On
completion the status becomes `closed`; non-abort failures become `error` while
retaining the latest value. Component cleanup aborts the generation, calls the
iterator's `return()` at most once, and ignores late yields or rejections.

### `timer(intervalMs, callback, options?)`

Runs interval work after the owning component mounts and clears the interval during cleanup.
`timer()` can be used in route leaves, layouts, app shells, and feature components.

```ts
import { invalidate } from '@askrjs/askr/data';
import { documentVisible, routeActive, timer } from '@askrjs/askr/resources';

function DashboardPage() {
  timer(30000, () => invalidate('dashboard:'), {
    when: [routeActive(['/', '/admin']), documentVisible()],
  });

  return <main>Dashboard</main>;
}
```

`when` accepts one check or an array of checks. Every check must return `true` for
the tick callback to run. `routeActive()` checks the current route path or matched route pattern;
`documentVisible()` skips hidden documents; `windowFocused()` skips unfocused documents when
`document.hasFocus()` is available.

When the owner rerenders, `timer()` keeps the latest callback and `when` checks. The
interval is recreated only when `intervalMs` changes.

For query invalidation, `@askrjs/askr/data` also exports `invalidateOnInterval()`,
which composes `timer()`, `routeActive()`, and visibility/focus checks for the common
polling case.

### `on(target, event, handler, options?)`

Registers an event listener after the owning component mounts and removes it during cleanup.
The target may be an `EventTarget` or a resolver returning an `EventTarget` (or
`null` when unavailable). Resolvers run only during client commits, so they are
safe to use with browser globals in SSR components.

```ts
import { on } from '@askrjs/askr/resources';

function SearchBox() {
  on(() => window, 'focus', () => {
    // refresh visible state
  });

  return <input type="search" />;
}
```

When the owner rerenders, `on()` keeps one listener attached and calls the latest handler.
If `target`, `event`, or listener options change, the listener is moved after the committed render.

The resolver form is evaluated only during a client commit. Use it for browser
globals so SSR and SSG rendering do not evaluate `window` or `document`.

### `createRef<T>()`

`createRef<T>()` returns a stable holder for an intrinsic element ref. Create it
outside the component render body and reuse it across renders:

```tsx
import { createRef } from '@askrjs/askr';

const inputRef = createRef<HTMLInputElement>();

function SearchBox() {
  return <input ref={inputRef} type="search" />;
}
```

The renderer updates `current` after commit and clears it on unmount. Changing
`current` does not schedule a render. Inline callback refs remain supported when
callback semantics are preferred.

### `task(callback)`

Runs one piece of lifecycle work after the owning component's committed mount.

```ts
import { task } from '@askrjs/askr/resources';

function ConnectionPanel() {
  task(() => {
    const connection = connect();
    return () => connection.close();
  });

  return <section>Connected</section>;
}
```

`task()` runs once per committed mount and runs its cleanup when the owner is removed.
Rerenders do not rerun the task; remounting the owner runs it again.

### `watch(source, callback)`

Runs owned side-effect work after the component commits and again when the
committed value of an explicit readable source changes.

```ts
import { watch } from '@askrjs/askr/resources';
import { navigate } from '@askrjs/askr/router';

watch(isAuthenticated, (authenticated, { initial, previous, signal }) => {
  if (authenticated) {
    navigate('/dashboard', { replace: true });
  }

  signal.addEventListener('abort', cancelPendingWork);
  return () => disconnect(previous, initial);
});
```

Pass `state()` and `derive()` accessors without calling them. For multiple
sources, pass an accessor tuple; values and previous values retain tuple
inference and are compared entry by entry with `Object.is`.

```ts
watch([authChecked, isAuthenticated] as const, ([checked, authenticated]) => {
  if (checked && authenticated) navigate('/dashboard', { replace: true });
});
```

The initial callback runs after the first successful client commit and is
reached by the normal scheduler `flush()`. Writes before the next scheduler
commit are coalesced. Before replacement, Askr aborts the previous generation
and then runs its synchronous cleanup. Unmounting does the same; remounting
starts a fresh initial generation. Callback errors follow the owned lifecycle
error-boundary path. Watchers are inert during SSR and SSG.

`watch()` takes accessors because it subscribes to source identity.
`resource(loader, deps)` retains its existing value-array contract because its
dependencies are restart snapshots rather than subscriptions. Create a
`derive()` first when the watched value is computed. Use `task()` for mount-only
setup and `resource()` for result-producing asynchronous reads.

### `onRouteChange(callback, options?)`

Runs after a persistent component commits a pathname, query, or hash change. The
initial route is skipped by default; pass `{ immediate: true }` to include it.
The callback receives the current and previous route snapshots. A returned
cleanup runs before the next callback and when the component unmounts. Failed or
superseded navigations do not publish a callback. Browser history back/forward
navigations are committed route changes and invoke the callback as well. During
SSR and SSG there is no client navigation commit, so `onRouteChange` does not
run; use the render-time route APIs for initial data.

```ts
import { onRouteChange } from '@askrjs/askr/resources';
declare function announce(message: string): void;
declare function cancelAnnouncement(path: string | undefined): void;

function Shell() {
  onRouteChange((current, previous) => {
    announce(`Opened ${current.path}`);
    return () => cancelAnnouncement(previous?.path);
  });
  return <main />;
}
```

### Other helpers

- `capture`

Async helpers accept promise-like values, including native promises and
compatible thenables. Component render functions remain synchronous.

Use this entrypoint when your module is primarily about async work, side
effects, or lifecycle-aware operations.

## Related

- [Resources Guide](../guides/resources.md)
- [Data guide](../core/data.md)
- [Troubleshooting](../troubleshooting/common-issues.md)
