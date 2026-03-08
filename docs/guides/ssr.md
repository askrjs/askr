# SSR Guide

Askr SSR renders UI to HTML strings for server output.

## High-level workflow

1. Register routes.
2. Resolve request path on server.
3. Render to HTML with SSR APIs.
4. Hydrate on the client with matching route state.

## Key constraints

- SSR is synchronous.
- Async components are not supported during synchronous SSR.
- Use deterministic inputs for stable hydration output.
- URL-based SSR helpers keep route tables in per-render context instead of mutating the client router registry.

## URL-based rendering

Use the URL-based helpers when the server should resolve routes explicitly:

```ts
import { renderToString } from '@askrjs/askr/ssr';

const html = renderToString({
	url: '/users/42?q=active',
	routes: [
		{
			path: '/users/{id}',
			handler: ({ id }) => <div>User {id}</div>,
		},
	],
});
```

## Related topics

- [SSG Guide](ssg.md)
- [SSR Events](ssr-events.md)
- [Selective Hydration](../advanced/selective-hydration.md)

## Next

- [API Overview](../reference/api.md)
- [Troubleshooting](../troubleshooting/common-issues.md)
