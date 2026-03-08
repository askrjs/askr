# Router Guide

Use the router for multi-page navigation in SPA mode.

## Register routes

```ts
import { route, getRoutes, navigate } from '@askrjs/askr/router';
import { createSPA } from '@askrjs/askr';

route('/', () => <Home />);
route('/about', () => <About />);
route('/users/{id}', ({ id }) => <User id={id} />);

await createSPA({
  root: document.getElementById('app')!,
  routes: getRoutes(),
});

navigate(window.location.pathname);
```

## Link component

Use `Link` for client-side navigation:

```tsx
import { Link } from '@askrjs/askr/router';

<Link href="/about">About</Link>;
```

## Layout composition

Use `layout()` to preserve shared DOM structure between route changes.

## Route handler guidance

- Keep handlers synchronous.
- Return UI immediately.
- Move async work into components with `resource()`.

## Next

- [Router API](../reference/router.md)
- [Resources Guide](resources.md)
- [SSR Guide](ssr.md)
