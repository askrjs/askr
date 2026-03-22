# Core: Routing

The Askr router uses a single, consistent model that scales from small apps to large ones
and works cleanly across SPA, SSR, and SSG. There is one way to define routes.

## One model

Route definitions are always written as `route(path, Component, options?)` calls placed
inside a `layout(Component, fn)` scope. The same declarations drive SPA navigation, SSR
request resolution, and SSG page expansion — no mode-specific APIs.

## Register routes and boot

```ts
// src/router.tsx
import { layout, route } from '@askrjs/askr/router';
import AppLayout from './layouts/app-layout';
import AuthLayout from './layouts/auth-layout';
import Home from './routes/home';
import Dashboard from './routes/dashboard';
import Login from './routes/login';
import NotFound from './routes/not-found';

layout(AppLayout, () => {
  route('/', Home);
  route('/dashboard', Dashboard);
});

layout(AuthLayout, () => {
  route('/login', Login);
});

route('/*', NotFound);
```

```ts
// src/main.ts
import { createSPA } from '@askrjs/askr';
import { getManifest } from '@askrjs/askr/router';
import './router'; // side-effect: runs layout() + route() declarations

createSPA(document.getElementById('app'), { manifest: getManifest() });
```

## Route path syntax

| Pattern   | Example         | Description                                        |
| --------- | --------------- | -------------------------------------------------- |
| Static    | `/settings`     | Literal segment — highest specificity              |
| Param     | `/posts/{slug}` | Captures one URL segment by name                   |
| Wildcard  | `/files/*`      | Captures exactly one segment (unnamed)             |
| Catch-all | `/*`            | Matches any path at any depth — lowest specificity |

**Parameter syntax**: always `{name}`. The `:name` Express style is not supported.

## Read the current route

Inside a component, call `route()` with no arguments:

```tsx
import { route } from '@askrjs/askr/router';

function PostPage() {
  const snap = route();
  // snap.params.slug — extracted from the URL
  // snap.query.get('tab') — query string value
  // snap.hash — fragment

  return <article>{snap.params.slug}</article>;
}
```

The snapshot is read-only and deeply frozen.

## Route options

```ts
route('/posts/{slug}', PostPage, {
  // Data loader: called before render; result accessible inside the component
  load: ({ params }) => fetchPost(params.slug),

  // SSG: return one param map per static page to pre-render
  entries: async () => getPosts().map((p) => ({ slug: p.slug })),

  // Navigation guard: return false to block, a path string to redirect
  guard: ({ params }) => isAuthenticated() || '/login',

  // Page title hint for SSG and document-meta integrations
  title: 'Post',
});
```

## Layout composition

`layout(Component, fn)` wraps all routes declared inside `fn` in `Component`. Layouts nest:

```ts
layout(AppShell, () => {
  layout(AdminPanel, () => {
    route('/admin/users', AdminUsers);
    route('/admin/settings', AdminSettings);
  });
  route('/dashboard', Dashboard);
  route('/*', NotFound);
});
```

Layout wrapping is applied automatically — no manual wrapping needed per route.

## Navigation

```ts
import { navigate } from '@askrjs/askr/router';

navigate('/dashboard');
navigate('/users/42', { replace: true });
```

## Link component

```tsx
import { Link } from '@askrjs/askr/router';

<Link href="/about">About</Link>;
```

## Specificity order

From highest to lowest: **literal** › **param** › **wildcard** › **catch-all**.

## See also

- [Router guide](../guides/router.md) — original detailed guide
- [Router reference](../reference/router.md)
- [Runtime](./runtime.md)
- [Rendering](./rendering.md)
