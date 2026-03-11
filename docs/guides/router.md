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
```

`createSPA()` immediately mounts the current URL when it matches a registered route.
If the current URL does not match yet, it keeps an empty placeholder mounted and waits for the first matching `navigate()` or `popstate` event.

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
- Use `navigate(path)` for user-driven transitions after startup, not for initial boot.

## Next

- [Router API](../reference/router.md)
- [Resources Guide](resources.md)
- [SSR Guide](ssr.md)
- [SSG Guide](ssg.md)
