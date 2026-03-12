# Router Guide

Use the router for multi-page navigation in SPA mode.

Prefer importing router-specific APIs from `@askrjs/askr/router`. The root package also re-exports router helpers for compatibility, but the router subpath is the primary docs entrypoint.

## Register routes and boot

```ts
import { route, getRoutes } from '@askrjs/askr/router';
import { createSPA } from '@askrjs/askr';

route('/', () => <Home />);
route('/about', () => <About />);
route('/users/{id}', ({ id }) => <User id={id} />);

await createSPA({
  root: document.getElementById('app')!,
  routes: getRoutes(),
});
```

`createSPA()` immediately mounts the current URL when it matches a registered route.
If the current URL does not match yet, it keeps an empty placeholder mounted and waits for the first matching `navigate()` or `popstate` event.

`createSPA({ routes })` is the authoritative boot input. `route(...)` plus `getRoutes()` is the convenience way to assemble that route table.

## Read the current route

Inside a component, call `route()` with no arguments to read the current route snapshot:

```tsx
import { route } from '@askrjs/askr/router';

function UserPage() {
  const current = route();

  return (
    <div>
      <h1>{current.path}</h1>
      <p>User id: {current.params.id}</p>
      <p>Query q: {current.query.get('q') ?? '(none)'}</p>
    </div>
  );
}
```

The snapshot is read-only and includes `path`, `params`, `query`, `hash`, and ordered `matches`.

## Link component

Use `Link` for client-side navigation:

```tsx
import { Link } from '@askrjs/askr/router';

<Link href="/about">About</Link>;
```

## Layout composition

Use `layout()` to preserve shared DOM structure between route changes.

## Matching and constraints

- Route matching prefers more specific paths: literals, then params, then wildcards, then catch-all routes.
- Router APIs are for SPA/SSR apps, not islands.
- Register routes before app startup. Production startup locks further registration.

## Route handler guidance

- Keep handlers synchronous.
- Return UI immediately.
- Move async work into components with `resource()`.
- Use `navigate(path)` for user-driven transitions after startup, not for initial boot.

## Next

- [Router API](../reference/router.md)
- [Resources Guide](resources.md)
- [SSR Guide](ssr.md)
- [SSG Guide](ssg.md)
