# Conventions

Askr applications follow a consistent set of naming and structural conventions.
These conventions reduce cognitive load, improve AI tooling accuracy, and make
projects easier to navigate.

## File naming

Use **kebab-case** for all files.

```
user-table.tsx        yes
userTable.tsx         no
UserTable.tsx         no
```

### Routes

Named after the path segment they represent:

```
src/routes/
  home.tsx
  users.tsx
  users.detail.tsx      - nested: /users/:id detail view
  settings.tsx
```

### Components

Named after what they render:

```
src/components/
  user-table.tsx
  settings-form.tsx
  page-header.tsx
  stat-card.tsx
```

### Feature folders

Group components, state helpers, and utilities for a single domain feature:

```
src/features/
  accounts/
    account-table.tsx
    account-filters.tsx
    account-form.tsx
```

### Types and utilities

```
src/lib/
  user.ts               - domain type definitions
  account.ts
  api.ts                - data fetching
  format.ts             - formatting helpers
  validators.ts         - input validation
```

## Component naming

Components use **PascalCase** inside JSX:

```tsx
export function UserTable() { ... }
export function SettingsForm() { ... }
```

Exported from the file as named exports, not default exports.

## Component rules

Components should:

- Compose behavior primitives from `askr-ui`
- Avoid business logic - business logic belongs in `src/lib/`
- Stay reusable - no hard-coded feature data inside general components
- Have narrow props interfaces - prefer composition over large prop surfaces

Components should not:

- Reach outside their scope for global mutable state
- Embed API calls directly - use `resource()` and pass results via props or context
- Mix business logic with rendering

## Route registration

All routes are captured in one file using `createRouteRegistry()`, `group()`, and `route()`:

```ts
// src/router.tsx
export const registry = createRouteRegistry(() => {
  group({ layout: AppLayout }, () => {
    route('/', Home);
    route('/users', Users);
    route('/settings', Settings);
    route('/*', NotFound);
  });
});
```

Layout groups are explicit. Nested layouts are composed with nested `group({ layout })` scopes.

## State

Local component state uses `state()` from `@askrjs/askr`:

```ts
const [open, setOpen] = state(false);
```

Shared state that crosses component boundaries uses `defineScope()` / `readScope()`.

## Async data

Async data loaded per-render uses `resource()`:

```ts
const users = resource(
  async ({ signal }) => fetch('/api/users', { signal }).then((r) => r.json()),
  []
);
```

Never use `useEffect` patterns for data loading - `resource()` handles cancellation,
pending state, and error boundaries automatically.

## Theming in Runtime Code

Runtime TS/JS should not hardcode Askr token names like `--ak-*`.

- Keep token declarations and semantic mappings in theme CSS.
- Use component state helpers and slot/state attributes for runtime behavior.
- If a dynamic style is needed, route through a semantic class or data attribute,
  then resolve it in CSS.

## See also

- [Project structure](./project-structure.md)
- [Glossary](./glossary.md)
- [Core: routing](../core/routing.md)
- [Core: data](../core/data.md)
