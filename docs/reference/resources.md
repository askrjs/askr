# Resources API Reference

Import from `@askrjs/askr/resources`.

Query and mutation helpers live in `@askrjs/askr/data`.

## Resource helpers

The resources subpath owns `resource()`, `on()`, `timer()`, `task()`, `stream()`,
`capture()`, `getSignal()`, `routeActive()`, `documentVisible()`, and `windowFocused()`.

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

`stream()` is currently a placeholder public surface. It preserves a stable
import and return-shape contract while the streaming source API is still being
designed.

Today it returns an object shaped like `{ value: null, pending: true, error: null }`.

Do not rely on it for real streaming behavior yet. Use `resource()`, `task()`,
`on()`, or `timer()` for implemented lifecycle-aware work.

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
