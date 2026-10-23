# Navigation

How the browser router behaves around a navigation: what loads, what renders
while it loads, what happens when it fails, and how the page announces the
change. Route declarations are in the [router reference](../reference/router.md).

## Loader cache and revalidation

Route loader results are cached in the app's data runtime by route template,
params and search. Going back, or visiting a page again, renders the cached
result immediately and refreshes it in the background; the page re-renders in
place when the new result arrives. Concurrent navigations to one URL share one
request.

```tsx
import { route, routeData } from '@askrjs/askr/router';

route('/posts/{slug}', PostPage, {
  loader: ({ params }) => fetchPost(params.slug),
  // Treat a result as fresh for 30 seconds: no request at all in that window.
  staleTimeMs: 30_000,
});
```

Without `staleTimeMs` every visit revalidates. Invalidate after a mutation with
the existing data API; keys begin with `route-data:` and the route template:

```ts
import { invalidate } from '@askrjs/askr/data';

invalidate('route-data:/posts/{slug}');
```

## Error and forbidden components

Declare `error` and `forbidden` on a `route()`, `page()` or `group()`. A failed
navigation renders the nearest `error` component at the destination URL, with a
`retry()` that resolves the location again. A denied route renders the nearest
`forbidden` component instead of the bare status placeholder.

```tsx
import { group, route } from '@askrjs/askr/router';

group(
  {
    error: ({ retry }) => (
      <button type="button" onClick={retry}>
        Something went wrong. Try again
      </button>
    ),
    forbidden: ({ status }) => <p>Not allowed ({status}).</p>,
  },
  () => {
    route('/reports', ReportsPage, { loader: loadReports });
  }
);
```
