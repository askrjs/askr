# Router Guide

The Askr router is built around one mental model:

- `route()` defines leaves
- `group()` defines inherited behavior
- `registerRoutes()` runs the composed route tree

The same route definitions drive SPA navigation, SSR request resolution, and SSG.

## Register routes and boot

```ts
// routes.ts
import { group, route, fallback } from '@askrjs/askr/router';
import AppLayout from './app';
import Home from './pages/home';
import About from './pages/about';
import PostPage from './pages/post';
import NotFound from './pages/not-found';

export function registerAppRoutes() {
  group({ layout: AppLayout }, () => {
    route('/', Home);
    route('/about', About);
    route('/posts/{slug}', PostPage, {
      entries: async () => getPosts().map((post) => ({ slug: post.slug })),
      title: 'Post',
    });
    fallback(NotFound);
  });
}
```

```ts
// main.ts
import { createSPA } from '@askrjs/askr';
import { getManifest, registerRoutes } from '@askrjs/askr/router';
import { registerAppRoutes } from './routes';

registerRoutes(registerAppRoutes);
await createSPA({ root: '#app', manifest: getManifest() });
```

## Group inheritance

`group(options, fn)` is a pathless behavioral scope. Child routes keep absolute
paths and inherit layout and access metadata.

```ts
group({ layout: AppShell }, () => {
  route('/', HomePage);

  group({ auth: true }, () => {
    route('/dashboard', DashboardPage);

    group({ role: 'admin', layout: AdminShell }, () => {
      route('/admin/users', AdminUsersPage);
      route('/admin/settings', AdminSettingsPage);
    });
  });

  fallback(NotFoundPage);
});
```

## Common access metadata

Use route metadata for the common case:

```ts
route('/login', LoginPage, { auth: 'guest' });
route('/dashboard', DashboardPage, { auth: true });
route('/admin', AdminPage, { role: 'admin' });
route('/billing', BillingPage, { permission: 'billing:read' });
```

Use `policies` only for advanced access checks:

```ts
route('/settings', SettingsPage, {
  auth: true,
  policies: [requireVerifiedEmail()],
});
```

## Read the current route

Inside a component, call `currentRoute()`:

```tsx
import { currentRoute } from '@askrjs/askr/router';

function PostPage() {
  const snap = currentRoute();
  return <article>{snap.params.slug}</article>;
}
```

`currentRoute()` is the route snapshot API inside components.

## Route options

```ts
route('/posts/{slug}', PostPage, {
  auth: true,
  loader: ({ params }) => fetchPost(params.slug),
  entries: async () => getPosts().map((post) => ({ slug: post.slug })),
  title: 'Post',
});
```

Notes:

- `loader` is the canonical name
- guest routes are prerenderable in SSG
- authenticated or policy-controlled routes are skipped as runtime-only in SSG by default

## Path syntax

- Static: `/settings`
- Param: `/posts/{slug}`
- Wildcard: `/files/*`
- Catch-all: `/*`

Always use `{name}` for params. `:name` is rejected.

## Next

- [Router API](../reference/router.md)
- [Router Internals](../internals/router-manifest.md)
