# Resources Guide

Use resources for cancellable async data fetching tied to component lifecycle.

## Basic usage

```ts
import { resource } from '@askrjs/askr/resources';

function UserCard({ id }: { id: string }) {
  const user = resource(async ({ signal }) => {
    const res = await fetch(`/api/users/${id}`, { signal });
    return res.json();
  }, [id]);

  if (user.pending || !user.value) return <div>Loading...</div>;
  if (user.error) return <div>Failed to load user</div>;
  return <div>{user.value.name}</div>;
}
```

## Resource result shape

`resource()` returns a stable object with four fields:

- `value`: the latest resolved value, or `null` before the resource resolves
- `pending`: `true` while work is in flight for the current generation
- `error`: the latest error, or `null` when the resource is healthy
- `refresh()`: cancels any in-flight work and re-runs the loader

## Why this pattern

- Automatic cancellation on teardown/navigation
- Stale request protection through the loader `signal`
- Explicit async intent through `@askrjs/askr/resources`

## Guidance

- Keep route handlers synchronous.
- Do fetches inside components with `resource()`.
- Put polling timers in the route, layout, or feature component that owns the work.
- Prefer `resource(async ({ signal }) => ...)` so the cancellation signal stays valid for the whole async operation.
- Use dependencies intentionally to re-run resource work.

## Route-aware polling

For query invalidation, use the data-owned convenience helper:

```ts
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

For lower-level interval work, compose `timer()` with route and visibility checks:

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

The timer is cleaned up when `DashboardPage` is removed. The `when` checks skip interval ticks
while the page is inactive or the document is hidden. Rerenders keep the latest callback and
checks without creating duplicate intervals.

## Async iterable streams

Use `stream()` when an adapter exposes a sequence of values rather than one
request result. Keep transport concerns in the adapter and pass the component
signal through to the transport:

```tsx
import { stream } from '@askrjs/askr/resources';

type Activity = { id: string; label: string };
declare function connectActivityFeed(input: {
  cursor: string;
  signal: AbortSignal;
}): AsyncIterable<{ id: string; label: string }>;
declare function projectLatestActivity(event: {
  id: string;
  label: string;
}): Activity[];
declare function ActivityList(props: {
  items: Activity[];
  stale: boolean;
}): JSX.Element;

function ActivityFeed({ cursor }: { cursor: string }) {
  const feed = stream(
    async function* ({ signal }) {
      for await (const event of connectActivityFeed({ cursor, signal })) {
        yield projectLatestActivity(event);
      }
    },
    { deps: [cursor], initialValue: [] as Activity[] }
  );

  if (feed.status === 'error') {
    return <p>Live updates paused; showing the last received activity.</p>;
  }
  return <ActivityList items={feed.value ?? []} stale={feed.stale} />;
}
```

The adapter should bound its projection, preserve any server cursor, deduplicate
replayed events, and decide how to reconnect. `stream()` supplies cancellation
and latest-value lifecycle state; it does not infer replay or retry semantics.
SSR and SSG render the initial value, when supplied, without opening the source.

## SSR with preloaded data

During synchronous SSR, pass resolved resource values through `renderToStringSync`
options so loaders do not run asynchronously:

```ts
import { renderToStringSync } from '@askrjs/askr/ssr';
import { resource } from '@askrjs/askr/resources';

function Page() {
  const user = resource(() => 'unused', []);
  return <div>{user.value}</div>;
}

const html = renderToStringSync(Page, undefined, {
  data: { 'r:0': { name: 'Ada' } },
});
```

Resource keys are assigned in render order (`r:0`, `r:1`, ...).

## Combining resources with `derive()`

A resource snapshot is not a `ReadableSource`. Reading `user.value` inside
`derive(() => ...)` does not create a fine-grained dependency on the resource;
updates still arrive when `resource()` schedules a component re-render.

Prefer the snapshot form when mapping resolved data:

```ts
const user = resource(loadUser, [id]);
const displayName = derive(user, (value) => value?.name ?? 'Guest');
```

Or read `user.value` directly in JSX.

## Next

- [Resources API](../reference/resources.md)
- [Troubleshooting](../troubleshooting/common-issues.md)
