# Tables Guide

Patterns for building data tables in Askr with filtering, sorting, and pagination.

Tables should keep data transformation deterministic. Derive visible rows from
source data and local table state instead of mutating the source array in place.

## Basic Table Pattern

```tsx
import { derive, state } from '@askrjs/askr';
import { For } from '@askrjs/askr/control';

type User = {
  id: string;
  name: string;
};

export function UserTable({ users }: { users: User[] }) {
  const [query, setQuery] = state('');

  const filtered = derive(() =>
    users.filter((user) =>
      user.name.toLowerCase().includes(query().toLowerCase())
    )
  );

  return (
    <section>
      <input
        value={query()}
        onInput={(event: Event) =>
          setQuery((event.target as HTMLInputElement).value)
        }
      />
      <table>
        <thead>
          <tr>
            <th>Name</th>
          </tr>
        </thead>
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
    </section>
  );
}
```

## Sorting and Pagination

- Store sort key, sort direction, and page in `state()`.
- Use `derive()` to compute sorted and paginated rows.
- Reset the page when filters change.
- Render an empty state when the visible row set is empty.

## Common Pitfalls

- Do not sort props in place; copy first.
- Keep column definitions close to the feature that owns the data.
- Keep server-side pagination state in the route or data boundary.

## See Also

- [Core: data](../core/data.md)
- [Guide: CRUD](./crud.md)
- [Guide: dashboard](./dashboard.md)
