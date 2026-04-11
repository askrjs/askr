# Layouts Guide

Patterns for structuring layouts in Askr applications.

> This guide is a work in progress.

## What this covers

- App shell layout (sidebar navigation + sticky header)
- Auth layout (centered, minimal)
- Nested layouts with `group({ layout })` scopes
- Responsive structure

## Layout groups

Layouts are registered using `group({ layout })` scopes in your router file. Groups are explicit —
each group has exactly one layout component wrapping its routes.

```ts
import { group, route } from '@askrjs/askr/router';

// Authenticated shell layout
group({ layout: AppLayout }, () => {
  route('/dashboard', Dashboard);
  route('/settings', Settings);
});

// Centered auth layout
group({ layout: AuthLayout }, () => {
  route('/login', Login);
});

// No layout — bare route
route('/*', NotFound);
```

## Recommended layout components

```
src/layouts/
  app-layout.tsx    — sidebar + sticky header + content
  auth-layout.tsx   — centered shell for login/onboarding
```

## See also

- [Core: routing](../core/routing.md)
- [Guide: dashboard](./dashboard.md)
- [Project structure](../reference/project-structure.md)
