# Project Structure

The canonical layout for an Askr application.

## Directory layout

```
src/
  routes/
  components/
  ui/
  lib/
  styles/

public/

askr.config.ts        (optional — for SSG or advanced config)
tsconfig.json
vite.config.ts
```

## `src/routes/`

Application pages. One file per route, named after the path.

```
src/routes/
  home.tsx
  users.tsx
  users.detail.tsx
  settings.tsx
```

Routes are registered in a central `router.tsx` or `routes.ts` file and grouped using
`registerRoutes()` and `group({ layout })`.

```ts
// src/router.tsx
import { group, registerRoutes, route } from '@askrjs/askr/router';
import AppLayout from './layouts/app-layout';
import Home from './routes/home';
import Users from './routes/users';

registerRoutes(() => {
  group({ layout: AppLayout }, () => {
    route('/', Home);
    route('/users', Users);
  });
});
```

## `src/components/`

Shared feature components. These are reusable pieces that belong to one feature or domain
but are not general-purpose UI primitives.

```
src/components/
  user-table.tsx
  user-filters.tsx
  stat-card.tsx
  page-header.tsx
```

## `src/ui/`

Reusable UI pieces that compose `askr-ui` primitives into application-specific patterns.
These are not domain-specific — they are used across features.

```
src/ui/
  form-field.tsx
  data-table.tsx
  empty-state.tsx
  loading-spinner.tsx
```

## `src/lib/`

Data logic, services, and utilities. No JSX. No components.

```
src/lib/
  api.ts
  mock-data.ts
  format.ts
  validators.ts
```

## `src/styles/`

CSS files. Typically layered in this order:

```
src/styles/
  reset.css       — baseline resets
  tokens.css      — design tokens (or imported from askr-themes)
  theme.css       — global typography and theme values
  layout.css      — page/shell structure
  components.css  — component-level styles
```

## `src/layouts/`

Layout components used to wrap route groups.

```
src/layouts/
  app-layout.tsx     — authenticated shell (sidebar + header)
  auth-layout.tsx    — minimal centered shell for login/onboarding
```

## `public/`

Static assets served directly. Not processed by the build.

## Naming conventions

See [Conventions](./conventions.md) for naming rules applied to files, components, and routes.

## See also

- [Conventions](./conventions.md)
- [Routing guide](../core/routing.md)
- [CLI: create](https://github.com/askrjs/askr-cli/tree/main/docs/create.md)
