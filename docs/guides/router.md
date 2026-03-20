# Router Guide

The Askr router uses a single, consistent model that scales from small apps to large ones and
works cleanly across SPA, SSR, and SSG. There is one way to define routes.

## One model

Route definitions are always written as `route(path, Component, options?)` calls placed inside
a `layout(Component, fn)` scope. The same declarations drive SPA navigation, SSR request
resolution, and SSG page expansion — no mode-specific APIs.

## Register routes and boot

```ts
// routes.ts — runs at module load time
import { layout, route, getManifest } from '@askrjs/askr/router';
import AppLayout from './app';
import Home from './pages/home';
import About from './pages/about';
import PostPage from './pages/post';

layout(AppLayout, () => {
  route('/', Home);
  route('/about', About);
  route('/posts/{slug}', PostPage, {
    entries: async () => getPosts().map((p) => ({ slug: p.slug })),
    title: 'Post',
  });
  route('/*', NotFound);
});
```

```ts
// main.ts
import { createSPA } from '@askrjs/askr';
import { getManifest } from '@askrjs/askr/router';
import './routes'; // side-effect: runs layout() + route() declarations

await createSPA({ root: '#app', manifest: getManifest() });
```

`createSPA({ manifest })` is the authoritative boot input.
If no route matches the initial URL the router stays idle until the first matching `navigate()` or
`popstate` event.

## Route path syntax

| Pattern   | Example         | Description                                        |
| --------- | --------------- | -------------------------------------------------- |
| Static    | `/settings`     | Literal segment — highest specificity              |
| Param     | `/posts/{slug}` | Captures one URL segment by name                   |
| Wildcard  | `/files/*`      | Captures exactly one segment (unnamed)             |
| Catch-all | `/*`            | Matches any path at any depth — lowest specificity |

**Parameter syntax**: always `{name}`. The `:name` Express style is explicitly rejected.

## Read the current route

Inside a component, call `route()` with no arguments:

```tsx
import { route } from '@askrjs/askr/router';

function PostPage() {
  const snap = route();
  // snap.params.slug — extracted from the URL
  // snap.query.get('tab') — query string
  // snap.hash — fragment
  return <article>{snap.params.slug}</article>;
}
```

The snapshot is read-only and deeply frozen.

## Route options

```ts
route('/posts/{slug}', PostPage, {
  // Server data loader (called before render; result accessible via resource())
  load: ({ params }) => fetchPost(params.slug),

  // SSG: return one param map per static page
  entries: async () => getPosts().map((p) => ({ slug: p.slug })),

  // Navigation guard: return false to block, a path string to redirect
  guard: ({ params }) => isAuthenticated() || '/login',

  // Page title hint for SSG and document-meta integrations
  title: 'Post',
});
```

## Layout composition

`layout(Component, fn)` establishes a scope. Every `route()` declared inside `fn` is
automatically rendered wrapped by `Component`. Layouts may nest:

```ts
layout(AppShell, () => {
  layout(AdminPanel, () => {
    route('/admin/users', AdminUsers);
    route('/admin/settings', AdminSettings);
  });
  route('/', HomePage);
  route('/*', NotFound);
});
```

Layout wrapping is applied automatically — no manual `app(<Page />)` call needed per route.

## Link component

```tsx
import { Link } from '@askrjs/askr/router';
<Link href="/about">About</Link>;
```

## Matching and specificity

Specificity order (highest first): **literal** › **param** › **wildcard** › **catch-all**.
When two routes tie, declaration order breaks the tie.

## Navigation after boot

```ts
import { navigate } from '@askrjs/askr/router';
navigate('/users/42');
```

Do not call `navigate` for the initial URL — `createSPA` already mounts the matched route at startup.

## SSG with parameterized routes

Routes with `entries` expand into multiple concrete pages during static generation:

```ts
route('/posts/{slug}', PostPage, {
  entries: async () => (await getPosts()).map((p) => ({ slug: p.slug })),
});
```

The SSG pipeline calls `entries()`, interpolates each param map into the path template, and
renders the corresponding page.

## Next

- [Router API](../reference/router.md)
- [Resources Guide](resources.md)
- [SSR Guide](ssr.md)
- [SSG Guide](ssg.md)
- [Router Internals](../internals/router-manifest.md)
