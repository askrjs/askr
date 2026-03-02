# Resources Guide

Use resources for cancellable async data fetching tied to component lifecycle.

## Basic usage

```ts
import { resource, getSignal } from '@askrjs/askr/resources';

function UserCard({ id }: { id: string }) {
  const user = resource(async () => {
    const res = await fetch(`/api/users/${id}`, { signal: getSignal() });
    return res.json();
  }, [id]);

  if (!user) return <div>Loading...</div>;
  return <div>{user.name}</div>;
}
```

## Why this pattern

- Automatic cancellation on teardown/navigation
- Stale request protection through `AbortSignal`
- Explicit async intent through `@askrjs/askr/resources`

## Guidance

- Keep route handlers synchronous.
- Do fetches inside components with `resource()`.
- Use dependencies intentionally to re-run resource work.

## Next

- [Resources API](../reference/resources.md)
- [Troubleshooting](../troubleshooting/common-issues.md)
