# Core: Routing

The Askr router uses one route model across SPA, SSR, and SSG:

- `createRouteRegistry()` captures route definitions
- `group()` defines inherited layout and access behavior
- `page()` defines a renderable route shell with nested child routes
- `index()` defines the default child route inside a page host
- `route()` defines pages
- `fallback()` defines the nearest pathful miss route

## Register routes

```ts
import { requireAnonymous, requireRole, requireUser } from '@askrjs/auth';
import {
  createRouteRegistry,
  fallback,
  group,
  index,
  Outlet,
  page,
  route,
} from '@askrjs/askr/router';

import AppLayout from './layouts/app-layout';
import AuthLayout from './layouts/auth-layout';
import Home from './routes/home';
import Dashboard from './routes/dashboard';
import Login from './routes/login';
import NotFound from './routes/not-found';

export const registry = createRouteRegistry(() => {
  group({ layout: AppLayout }, () => {
    route('/', Home);

    page('/docs/components', DocsComponentsPage, () => {
      index(DocsComponentsOverview);
      route('tabs', DocsComponentsTabs);
      route('pills', DocsComponentsPills);
    });

    group({ layout: AuthLayout, auth: requireAnonymous() }, () => {
      route('/login', Login);
    });

    group({ auth: requireUser() }, () => {
      route('/dashboard', Dashboard);
    });

    fallback(NotFound);
  });
});
```

Use `group()` and `page()` for different jobs:

- `group()` is behavioral and pathless.
- `page()` is pathful and renderable.
- `group({ layout })` wraps matched routes from the outside.
- `page()` renders only when its pathname subtree is active and places child content with `Outlet()`.
- Child `route()` calls inside `page()` must be relative.
- `index()` creates the concrete default child route at the page pathname.

Fallback handling is pathful: `fallback()` registers either the root miss route
or a page-local miss route. `group()` can wrap fallback rendering, but it does
not define fallback scope because it is pathless.

Inside a page host, render the active child with `Outlet()`:

```tsx
import { Outlet } from '@askrjs/askr/router';

function DocsComponentsPage() {
  return (
    <section>
      <h1>Components</h1>
      <Outlet />
    </section>
  );
}
```

## Read the route

Inside a component, call `currentRoute()`:

```tsx
import { currentRoute } from '@askrjs/askr/router';

function PostPage() {
  const snap = currentRoute();
  return <article>{snap.params.slug}</article>;
}
```

## Route options

```ts
route('/posts/{slug}', PostPage, {
  auth: requireUser(),
  loader: ({ params }) => fetchPost(params.slug),
  entries: async () => getPosts().map((post) => ({ slug: post.slug })),
  policies: [requireVerifiedEmail()],
  title: 'Post',
});
```

## Group inheritance

Groups are pathless scopes. Child routes keep absolute paths.

```ts
group({ layout: RootLayout }, () => {
  route('/', HomePage);

  group({ auth: requireUser() }, () => {
    route('/dashboard', DashboardPage);

    group({ layout: AdminPanel, auth: requireRole('admin') }, () => {
      route('/admin/users', AdminUsersPage);
      route('/admin/settings', AdminSettingsPage);
    });
  });

  fallback(NotFoundPage);
});
```

## Path syntax

- Static: `/settings`
- Param: `/posts/{slug}`
- Wildcard: `/files/*`
- Catch-all: `/*`

Always use `{name}` for params.

## Navigation

```ts
import { navigate } from '@askrjs/askr/router';

navigate('/dashboard');
navigate('/users/42', { replace: true });
```
