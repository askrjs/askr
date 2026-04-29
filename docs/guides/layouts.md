# Layouts Guide

Patterns for structuring layouts in Askr applications.

Layouts are registered with `group({ layout })` scopes. Each group wraps its
routes with one layout component, which keeps shell behavior explicit and
predictable.

## Layout Groups

```tsx
import { fallback, group, route } from '@askrjs/askr/router';
import { AppLayout } from '../layouts/app-layout';
import { AuthLayout } from '../layouts/auth-layout';

group({ layout: AppLayout }, () => {
  route('/dashboard', Dashboard);
  route('/settings', Settings);
});

group({ layout: AuthLayout }, () => {
  route('/login', Login);
});

fallback(NotFound);
```

## Recommended Layout Components

```text
src/layouts/
  app-layout.tsx
  auth-layout.tsx
```

Use an app layout for authenticated navigation, persistent headers, and main
content regions. Use an auth layout for login, onboarding, and other narrow
flows.

## Common Pitfalls

- Do not put route registration inside layout components.
- Keep layout components focused on structure; fetch route data in route components.
- Use one layout per group to avoid unclear nesting.

## See Also

- [Core: routing](../core/routing.md)
- [Guide: dashboard](./dashboard.md)
- [Project structure](../reference/project-structure.md)
