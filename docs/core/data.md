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

`state()` returns a callable, iterable state cell. Destructure it as a
`[getter, setter]` tuple as above, or retain the cell and use `count()` with
`count.set(1)`; both forms are equivalent. If the state value itself is a
function, replace it with updater form such as `setHandler(() => nextHandler)`.

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
They are intentionally small: keyed caching, prefix invalidation, explicit
eventual-consistency signaling, and an optional data runtime for cache isolation.

### Data runtimes

The default data runtime is enough for one app instance. Use `createDataRuntime()`
when tests, embedded apps, or multi-root shells need isolated query and mutation
state:

```ts
import { createDataRuntime, createQuery, invalidate } from '@askrjs/askr/data';

const dataRuntime = createDataRuntime();

const user = createQuery({
  runtime: dataRuntime,
  key: 'user:123',
  fetch: ({ signal }) => userService.getUser('123', { signal }),
});

invalidate('user:', { runtime: dataRuntime });
```

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
load only, while `refreshing` and `pending-write` always imply `stale: true` and keep the
previous value available. A mutation-driven invalidation commits `pending-write` first, then
moves to `refreshing` when the confirming fetch starts.
`staleReason` narrows settled stale states into `inconsistent`, `aborted`, or `error`.
Manual calls to `refresh()` coalesce while a request is pending. `invalidate()`
is the distinct operation that replaces stale work. A `reconcile` callback may
be async; its decision is awaited before any retry is scheduled, and a thrown
consistency or reconciliation callback becomes a terminal stale error.
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

### Dynamic query collections

Use `createQueryCollection()` when one component owns a changing set of inputs
for one `QueryDefinition`. The collection uses the same `DataRuntime` cache and
query cells as `createQuery()`, while bounding the first loads and collection
retries that it starts:

```tsx
import { state } from '@askrjs/askr';
import { createQueryCollection, defineQuery } from '@askrjs/askr/data';

const schemaByDatabase = defineQuery({
  key: ({ database }: { database: string }) => `schemas:${database}`,
  fetch: async ({ database, signal }) => {
    const response = await fetch(`/api/databases/${database}/schema`, {
      signal,
    });
    return (await response.json()) as { tables: readonly string[] };
  },
});

function SchemaBrowser() {
  const databases = state(['postgres', 'analytics', 'warehouse']);
  const catalogs = createQueryCollection({
    query: schemaByDatabase,
    inputs: () => databases().map((database) => ({ database })),
    key: ({ database }) => database,
    concurrency: 3,
  });

  return (
    <ul>
      {catalogs.entries.map(({ key, query }) => (
        <li key={key}>
          {key}: {query.data?.tables.length ?? 'loading'}
        </li>
      ))}
    </ul>
  );
}
```

`entries` preserves the input order and exposes each underlying `query`.
`results` and `errors` are keyed maps containing settled data and per-key
errors. `loading` is true while any entry is loading or refreshing, and
`settled` is its inverse. Use `retry(key)` to retry one entry through the
collection's concurrency queue.

Collection identity and lifecycle are deterministic:

- The first input for a duplicate collection key wins. Reordering a key keeps
  its query reader; changing the query key for that collection key replaces it.
- Growth starts only uncached entries. Shrinkage detaches removed readers and
  aborts their work when the collection held the last cache reader.
- Component unmount detaches every reader, cancels queued starts, and aborts
  in-flight work that no other query reader owns.
- Query-definition keys still own cache identity, request deduplication,
  freshness, and prefix invalidation. Two collection keys that resolve to the
  same query key share one query cell.
- `concurrency` defaults to 4 and must be a positive integer. It bounds initial
  collection loads and `retry()` calls. Direct `entry.query.refresh()` and
  global `invalidate()` retain their existing immediate query semantics.
- During SSR and SSG rendering, the collection reads hydrated query data but
  does not start client fetches. Prefetch the definition's inputs into the
  request-owned runtime before rendering.

### Query UI cookbook

Use the explicit query fields directly in app UI:

```tsx
import type { Query } from '@askrjs/askr/data';

type User = {
  id: string;
  name: string;
};

function UserPanel({ user }: { user: Query<User> }) {
  if (user.loading) {
    return <section>Loading user...</section>;
  }

  if (user.staleReason === 'error' && user.data === null) {
    return (
      <section>
        <p>Could not load user.</p>
        <button onClick={() => void user.refresh()}>Retry</button>
      </section>
    );
  }

  const status =
    user.consistency === 'pending-write'
      ? 'Saved, syncing...'
      : user.refreshing
        ? 'Refreshing...'
        : user.stale
          ? 'Showing stale data'
          : 'Up to date';

  return (
    <section>
      <h2>{user.data.name}</h2>
      <p>{status}</p>
      {user.staleReason === 'error' ? <p>Refresh failed.</p> : null}
      <button onClick={() => void user.refresh()} disabled={user.refreshing}>
        Refresh
      </button>
    </section>
  );
}
```

- First load: show loading UI when `loading` is true and `data` is `null`.
- Error before data: show a first-load error state and wire retry to `refresh()`.
- Error after data: keep previous data visible, show the error context, and allow retry.
- Background refresh: keep rendering `data`; use `refreshing` for subtle progress.
- Stale data warning: when `stale` is true, keep visible data and explain the stale reason.
- Mutation pending-write: treat `pending-write` as saved locally but still syncing.

After a mutation, invalidate affected query prefixes:

```ts
import { createMutation, invalidate } from '@askrjs/askr/data';

type UserInput = {
  id: string;
  name: string;
};

type User = UserInput & {
  version: number;
};

const saveUser = createMutation<UserInput, User>({
  action: async (input, { signal }) => {
    const res = await fetch(`/api/users/${input.id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
      signal,
    });
    return res.json();
  },
  affects: (input) => [`user:${input.id}`],
  afterSuccess: 'invalidate',
});

invalidate('user:', { markPendingWrite: true });
```

For feature-local query prefixes, use `queryScope(namespace)` to build canonical keys.
The namespace must be non-empty after trimming:

```ts
import { queryScope } from '@askrjs/askr/data';

const admin = queryScope('admin');
admin.invalidate(['buckets', 'main']);
```

The raw `invalidate(prefix)` API performs a literal string-prefix match. For
example, `invalidate('user:1')` also matches `user:10` and
`user:1:permissions`. Include an unambiguous delimiter in hand-built prefix
schemes, or prefer `queryScope()` when key segments can share textual prefixes;
scoped keys encode segment boundaries so a `user` scope never invalidates a
`users` scope.

Invalidation listeners run synchronously and may invalidate a different prefix
to form a short, acyclic cascade. Re-entering a prefix that is already active
throws an Askr cyclic-cascade error naming that prefix. Cascades with changing
prefixes are capped at 100 nested events and fail with an Askr depth diagnostic
instead of exhausting the JavaScript call stack. Keep application invalidation
graphs acyclic and bounded.

For route-owned dashboards, use the small route-aware invalidation helper:

```tsx
import { invalidateOnInterval } from '@askrjs/askr/data';

function DashboardPage() {
  invalidateOnInterval('dashboard:', {
    intervalMs: 30000,
    activeOn: ['/', '/admin'],
    visibleOnly: true,
  });

  return <main>Dashboard</main>;
}
```

### Query test fixtures

Use `@askrjs/askr/testing` for query-shaped test fixtures in page and component tests:

```ts
import { queryState } from '@askrjs/askr/testing';

const freshUser = queryState.fresh({ id: '123', name: 'Ada' });
const loadingUser = queryState.loading();
const refreshingUser = queryState.refreshing({ id: '123', name: 'Ada' });
const failedUser = queryState.error(new Error('boom'), {
  id: '123',
  name: 'Ada',
});
```

`mockQuery(data)` remains available as the original fresh-query shortcut.

### Mutations

```ts
import { createMutation } from '@askrjs/askr/data';

type User = {
  id: string;
  name: string;
  version: number;
};

const saveUser = createMutation<{ id: string; name: string }, User>({
  key: 'user/save',
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

Give mutations used in component tests a stable `key`. A runtime-scoped test
registry can then replace the normal mutation cell without mocking the feature
module:

```tsx
import {
  createMutationTestRegistry,
  mutationState,
} from '@askrjs/askr/testing';

const mutations = createMutationTestRegistry();
const save = mutationState<{ id: string }, boolean>();
mutations.set('user/save', save);

const pending = save.execute({ id: '123' });
save.succeed(true);
await pending;

mutations.clear();
```

Fixtures expose `setPending()`, `succeed(result)`, `fail(error)`, `abort()`,
and `reset()` for deterministic state changes. Registry `delete()` and
`clear()` reset removed mutations, and each registry owns an isolated data
runtime. Pass that runtime as `dataRuntime` to `renderRoute()`.

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

Listen to an event source:

```ts
import { on } from '@askrjs/askr/resources';

const handleFocus = () => {
  // respond to the focus event
};

on(() => window, 'focus', handleFocus);
```

`on()` registers the listener during mount and removes it during cleanup. Rerenders keep
one listener attached and update it to call the latest handler; changing the target or
event moves the listener after the committed render.

### timer()

Run work on an interval:

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

`timer()` starts on mount and clears the interval during cleanup. Put it in the route or layout
that owns the work; optional `when` checks let you skip ticks when the route is inactive,
the document is hidden, or another app condition is false. Rerenders keep the latest callback
and checks; the interval is recreated only when `intervalMs` changes.

## Scope

Share values across a component tree without prop-drilling.

```tsx
import { defineScope, readScope } from '@askrjs/askr';

const ThemeScope = defineScope<'light' | 'dark'>('light');

function Panel() {
  const theme = readScope(ThemeScope);
  return <div>{theme}</div>;
}

function App() {
  return (
    <ThemeScope value="dark">
      <Panel />
    </ThemeScope>
  );
}
```

## See also

- [State guide](../guides/state.md)
- [Resources guide](../guides/resources.md)
- [API reference](../reference/api.md)
- [Conventions](../reference/conventions.md)
