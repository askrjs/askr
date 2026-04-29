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

## Reactive utilities

### on()

React to an event source:

```ts
import { on } from '@askrjs/askr/resources';

const data = on(eventSource, transformer);
```

### timer()

Trigger a resource on an interval:

```ts
import { timer } from '@askrjs/askr/resources';

const tick = timer(1000); // fires every 1000ms
```

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
