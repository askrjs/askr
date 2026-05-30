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

const user = createQuery({
  key: 'user:123',
  fetch: ({ signal }) => userService.getUser('123', { signal }),
  isConsistent: (data) => data.version >= expectedVersion,
  reconcile: () => true,
});

if (user.consistency === 'pending-write') {
  // Saved, syncing...
}

invalidate('user:');
```

Query state is shared by key through a simple in-memory cache. `refresh()` returns a promise,
preserves the last value while refreshing, and surfaces `fresh`, `stale`, `refreshing`, and
`pending-write` explicitly through `consistency`.

### Mutations

```ts
import { createMutation } from '@askrjs/askr/data';

const saveUser = createMutation({
  action: (input, { signal }) => userService.updateUser(input, { signal }),
  affects: (input, result) => ['user:123'],
  afterSuccess: 'invalidate',
});

await saveUser.execute({ id: '123', name: 'Ada' });
```

Mutations own their own `AbortController`, abort the previous request when a new execution
starts, and can mark affected queries as `pending-write` before refreshing them.

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

```ts
import { defineContext, readContext } from '@askrjs/askr';

const ThemeContext = defineContext<'light' | 'dark'>('light');

// Provider:
ThemeContext.provide('dark');

// Consumer anywhere in the tree:
const theme = readContext(ThemeContext);
```

## See also

- [State guide](../guides/state.md)
- [Resources guide](../guides/resources.md)
- [API reference](../reference/api.md)
- [Conventions](../reference/conventions.md)
