# Tables Guide

Patterns for building data tables in Askr with filtering, sorting, and pagination.

> This guide is a work in progress.

## What this covers

- Rendering a list with `For`
- Column definitions
- Client-side filtering with `state()` and `derive()`
- Sorting
- Pagination patterns
- Empty state

## Basic table pattern

```tsx
import { state, derive, For } from '@askrjs/askr';

function UserTable({ users }: { users: User[] }) {
  const [query, setQuery] = state('');

  const filtered = derive(() =>
    users.filter((u) => u.name.toLowerCase().includes(query().toLowerCase()))
  );

  return (
    <>
      <input
        value={query()}
        onInput={(e: Event) => setQuery((e.target as HTMLInputElement).value)}
      />
      <table>
        <thead>...</thead>
        <tbody>
          <For each={filtered()}>
            {(user) => (
              <tr>
                <td>{user.name}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </>
  );
}
```

## See also

- [Core: data](../core/data.md)
- [Guide: CRUD](./crud.md)
- [Guide: dashboard](./dashboard.md)
