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

## Pending state

`navigationState()` tells the UI when the router is waiting on a destination and
when it is refreshing cached data behind a page that already rendered:

```tsx
import { navigationState } from '@askrjs/askr/router';

function RouteProgress() {
  const { pending, to, revalidating } = navigationState();
  return (
    <div role="status" aria-live="polite">
      {pending ? `Loading ${to}` : revalidating ? 'Refreshing' : ''}
    </div>
  );
}
```

A navigation is pending from the moment a click needs asynchronous work until
the destination commits or fails; the current page stays on screen meanwhile.

## Blocking navigation

`blockNavigation(shouldBlock)` guards unsaved work. Return a message to ask the
visitor, `true` to refuse and handle it yourself, or `false` to allow. It
covers `navigate()`, links, back/forward and tab close.

```tsx
const unblock = blockNavigation(() =>
  dirty() ? 'Discard your changes?' : false
);
```

Call the returned function when the form is saved or unmounted. See the
[reference](../reference/router.md#blocknavigationshouldblock) for the
back-button limitations.

## Focus and announcements

After a navigation to a different path that adds or replaces a history entry,
the router moves keyboard focus to the new page and announces it, so screen
reader and keyboard users learn that the page changed:

1. Focus goes to the first `[data-askr-focus-target]`, else `<main>`, else the
   first `<h1>`, else the app root. A non-focusable target receives a temporary
   `tabindex="-1"`, removed when focus leaves. Scrolling is not affected by the
   focus move.
2. A visually hidden `aria-live="polite"` region (`[data-askr-announcer]`)
   announces the document title once route metadata has been applied, or the
   pathname when there is none.

Nothing moves for the first page load, a fragment link, a query-only change on
the same path, `updateRouteQuery()`, or back/forward traversal (which keeps its
own focus restoration). A text field that survives the navigation, such as a
search box in a shared layout, keeps focus.

```tsx
await createSPA({
  root: '#app',
  registry,
  focus: {
    target: '#content-heading',
    announce: ({ pathname, title }) => `${title || pathname} loaded`,
  },
});
```

`focus: false` turns both off for applications that manage focus themselves.
`target` is a selector or a function receiving the app root, and `announce:
false` keeps the focus move but silences the live region.

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
