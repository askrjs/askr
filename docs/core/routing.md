# Core: Routing

The Askr router uses one route model across SPA, SSR, and SSG:

- `registerRoutes()` starts registration
- `group()` defines inherited layout and access behavior
- `route()` defines pages
- `fallback()` defines the root catch-all

## Register routes

```ts
import {
  fallback,
  getManifest,
  group,
  registerRoutes,
  route,
} from '@askrjs/askr/router';

import AppLayout from './layouts/app-layout';
import AuthLayout from './layouts/auth-layout';
import Home from './routes/home';
import Dashboard from './routes/dashboard';
import Login from './routes/login';
import NotFound from './routes/not-found';

registerRoutes(() => {
  group({ layout: AppLayout }, () => {
    route('/', Home);

    group({ layout: AuthLayout, auth: 'guest' }, () => {
      route('/login', Login);
    });

    group({ auth: true }, () => {
      route('/dashboard', Dashboard);
    });

    fallback(NotFound);
  });
});
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
  auth: true,
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

  group({ auth: true }, () => {
    route('/dashboard', DashboardPage);

    group({ layout: AdminPanel, role: 'admin' }, () => {
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
