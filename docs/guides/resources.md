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
- Prefer `resource(async ({ signal }) => ...)` so the cancellation signal stays valid for the whole async operation.
- Use dependencies intentionally to re-run resource work.

## Next

- [Resources API](../reference/resources.md)
- [Troubleshooting](../troubleshooting/common-issues.md)
