# Core: Data

State management and async data primitives in Askr.

## State

Local component state uses `state()`.

```ts
import { state } from '@askrjs/askr';

const [count, setCount] = state(0);

count(); // read current value
setCount(1); // set a value
setCount((n) => n + 1); // update with a function
```

`state()` returns a `[getter, setter]` tuple. Always call the getter as a function.
If the state value itself is a function, replace it with updater form such as
`setHandler(() => nextHandler)`.

## Derived state

`derive()` creates a computed value that re-evaluates when upstream state changes.

```ts
import { derive, state } from '@askrjs/askr';

const [count, setCount] = state(0);
const doubled = derive(() => count() * 2);

// doubled() automatically updates when count() changes
```

Two-argument form separates the source read from the mapping function:

```ts
const [user, setUser] = state({ name: 'Alex', age: 28 });
const isAdult = derive(
  () => user(),
  (u) => u.age >= 18
);
```

## Async data - resource()

`resource()` handles async data loading tied to component lifecycle.
It manages loading state, cancellation, and errors automatically.
Use `@askrjs/askr/data` for query and mutation state, and keep `resource()`
for lifecycle-aware async work.

```ts
import { resource } from '@askrjs/askr/resources';

function UserCard({ id }: { id: string }) {
  const user = resource(
    async ({ signal }) => {
      const res = await fetch(`/api/users/${id}`, { signal });
      return res.json();
    },
    [id]   // re-run when id changes
  );

  if (user.pending || !user.value) return <div>Loading...</div>;
  if (user.error) return <div>Failed to load user</div>;
  return <div>{user.value.name}</div>;
}
```

### Resource result shape

| Field       | Description                                              |
| ----------- | -------------------------------------------------------- |
| `value`     | Latest resolved value, or `null` before first resolution |
| `pending`   | `true` while in-flight for the current generation        |
| `error`     | Latest error, or `null` when healthy                     |
| `refresh()` | Cancel in-flight work and re-run the loader              |

### Cancellation

The `signal` parameter is an `AbortSignal`. Pass it to `fetch()` and any other cancellable
APIs. When the component re-renders with new deps or unmounts, in-flight work is cancelled
automatically.

## Minimal data layer

For app data, use the thin query and mutation primitives from `@askrjs/askr/data`.
They are intentionally small: keyed caching, prefix invalidation, and explicit
eventual-consistency signaling without a query-client abstraction.

### Queries

```ts
import { createQuery, invalidate } from '@askrjs/askr/data';

type User = {
  id: string;
  name: string;
  version: number;
};

const expectedVersion = 3;

const user = createQuery<User>({
  key: 'user:123',
  fetch: ({ signal }) => userService.getUser('123', { signal }),
  isConsistent: (data) => data.version >= expectedVersion,
  reconcile: () => true,
});

if (user.consistency === 'pending-write') {
  // Saved, syncing...
  user.data.id;
}

if (user.consistency === 'refreshing') {
  // Previous data is still available while a refresh is in flight.
  user.data.id;
}

if (user.loading) {
  // First load has not produced any data yet.
  user.data; // null
}

if (user.consistency === 'stale' && user.error === null) {
  // The value is available, but it is known to be stale or inconsistent.
  user.data.id;
}

if (user.staleReason === 'inconsistent') {
  // The fetch resolved, but the value did not satisfy isConsistent().
  user.data.id;
}

if (user.staleReason === 'aborted') {
  // A refresh was canceled with an abort-like error, so the last value stays visible.
  user.data.id;
}

if (user.staleReason === 'error') {
  // Query errors always surface through a stale, non-refreshing state.
  console.error(user.error);
}

invalidate('user:');
```

Query state is shared by key through a simple in-memory cache. `refresh()` returns a promise,
preserves the last value while refreshing, and surfaces `fresh`, `stale`, `refreshing`, and
`pending-write` explicitly through `consistency`. `loading` represents the first unresolved
load only, while `refreshing` and `pending-write` always keep the previous value available.
`staleReason` narrows settled stale states into `inconsistent`, `aborted`, or `error`.
The key also defines the query contract itself. If multiple readers use the same key, or one
reader rerenders that key with a different definition, keep `fetch`, `isConsistent`, and
`reconcile` aligned; development builds warn when a later render tries to redefine a shared
key differently.
`stale` covers either a value that still exists but is known to be inconsistent, or an error
state after a failed fetch or refresh. Failed refreshes can still keep the last good value in
`data`, while a failed first load leaves `data` as `null`. Abort-like refresh cancellations also
surface as stale-with-value so apps can keep rendering the last committed data. Queries reserve `null` as the
"no successful value yet" sentinel, so model empty results explicitly instead of returning
`null` or `undefined` from `fetch()`. Nullish thrown values are normalized before they reach
`error`, so any surfaced query error is always non-null.

### Mutations

```ts
import { createMutation } from '@askrjs/askr/data';

type User = {
  id: string;
  name: string;
  version: number;
};

const saveUser = createMutation<{ id: string; name: string }, User>({
  action: (input, { signal }) => userService.updateUser(input, { signal }),
  affects: (input, result) => ['user:123'],
  afterSuccess: 'invalidate',
});

await saveUser.execute({ id: '123', name: 'Ada' });

if (saveUser.status === 'success') {
  saveUser.result.id;
}

if (saveUser.status === 'error') {
  console.error(saveUser.error);
}
```

Mutations own their own `AbortController`, abort the previous request when a new execution
starts, and can mark affected queries as `pending-write` before refreshing them.
`status` narrows `pending`, `result`, and `error`. `abort()` only cancels an in-flight
execution, while `reset()` clears settled mutation state back to idle. Nullish thrown values
are normalized before they reach `error`, so `status === 'error'` always carries a non-null
error value.

### Layering

Keep the app structure explicit:

component -> query / mutation -> service -> adapter

Queries and mutations call services only. Services unwrap transport responses and map backend
snake_case into application-level camelCase models. Adapters should remain raw transport clients.

## Reactive utilities

### on()

React to an event source:

```ts
import { on } from '@askrjs/askr/resources';

const handleFocus = () => {
  // respond to the focus event
};

on(window, 'focus', handleFocus);
```

`on()` registers the listener during mount and removes it during cleanup.

### timer()

Run work on an interval:

```ts
import { timer } from '@askrjs/askr/resources';

timer(1000, () => {
  // poll or refresh here
});
```

`timer()` starts on mount and clears the interval during cleanup.

## Context

Share values across a component tree without prop-drilling.

```tsx
import { defineContext, readContext } from '@askrjs/askr';

const ThemeContext = defineContext<'light' | 'dark'>('light');

function Panel() {
  const theme = readContext(ThemeContext);
  return <div>{theme}</div>;
}

function App() {
  return (
    <ThemeContext.Scope value="dark">
      <Panel />
    </ThemeContext.Scope>
  );
}
```

## See also

- [State guide](../guides/state.md)
- [Resources guide](../guides/resources.md)
- [API reference](../reference/api.md)
- [Conventions](../reference/conventions.md)
