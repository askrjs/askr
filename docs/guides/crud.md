# CRUD Guide

Patterns for building Create, Read, Update, and Delete interfaces in Askr.

CRUD screens are ordinary routed components. Keep route files focused on page
composition, keep data access in `src/lib`, and keep reusable table/form pieces
under a feature directory.

## Recommended Structure

```text
src/routes/
  users.tsx
  users.detail.tsx

src/features/users/
  user-table.tsx
  user-form.tsx
  user-filters.tsx

src/lib/
  users.ts
```

## Data Flow

- Load list and detail data at the route or feature-container boundary.
- Use `resource()` for async reads that need cancellation and pending/error state.
- Use `state()` for local form and filter state.
- After create, update, or delete actions, update local state or refetch at the route boundary.

## Minimal Pattern

```tsx
import { resource } from '@askrjs/askr/resources';
import { UserTable } from '../features/users/user-table';
import { listUsers } from '../lib/users';

export function UsersRoute() {
  const users = resource(({ signal }) => listUsers({ signal }), []);

  if (users.pending) return <p>Loading users...</p>;
  if (users.error) return <p role="alert">Unable to load users.</p>;

  return <UserTable users={users.value ?? []} />;
}
```

## Common Pitfalls

- Do not put API clients in generic UI primitives.
- Keep delete confirmation state local to the row, dialog, or route that owns the action.
- Keep feature-specific table columns in the feature directory, not in `src/ui`.

## See Also

- [Core: data](../core/data.md)
- [Guide: forms](./forms.md)
- [Guide: tables](./tables.md)
- [Conventions](../reference/conventions.md)
