# Navigation

How the browser router behaves around a navigation: what loads, what renders
while it loads, what happens when it fails, and how the page announces the
change. Route declarations are in the [router reference](../reference/router.md).

- [Loader cache and revalidation](#loader-cache-and-revalidation)
- [Layout data](#layout-data)
- [Typed search params](#typed-search-params)
- [Prefetching](#prefetching)
- [Pending state](#pending-state)
- [Blocking navigation](#blocking-navigation)
- [Focus and announcements](#focus-and-announcements)
- [Error and forbidden components](#error-and-forbidden-components)
- [Untrusted redirect targets](#untrusted-redirect-targets)
- [Canonical URLs](#canonical-urls)

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

## Layout data

`group()` and `page()` take a `loader` too. Ancestor loaders run beside the
leaf's loader and lazy chunk, share the cache above, and layouts read their
results with `layoutData(loader)`; `routeData()` stays the leaf's own data.

```tsx
import { group, layoutData, route } from '@askrjs/askr/router';

const loadAccount = async () => ({ name: 'Ada' });

group(
  {
    loader: loadAccount,
    layout: ({ children }) => (
      <div>
        <header>{layoutData(loadAccount).name}</header>
        {children}
      </div>
    ),
  },
  () => {
    route('/inbox', InboxPage);
  }
);
```

## Typed search params

A route with a `search` schema receives its query string parsed and typed. A
bad or missing value takes the schema default instead of failing the
navigation:

```tsx
import { schema } from '@askrjs/schema';
import { route } from '@askrjs/askr/router';

const PostsSearch = schema.object({
  page: schema.integer({ minimum: 1, default: 1 }),
});

route('/posts', PostsPage, {
  search: PostsSearch,
  loader: ({ searchParams }) => fetchPosts(searchParams.page),
});
```

Read it in components with `currentRoute().search`. Loaders do not re-run for
`updateRouteQuery()`; use `navigate()` when a query change must reload data.

## Prefetching

`<Link prefetch>` warms a destination before the click. `prefetch="intent"`
starts on pointer enter and keyboard focus, `prefetch="render"` when the link
mounts. The route's lazy chunk loads and the route resolves through the loader
cache, so the navigation that follows renders from warm data. Use `render` for
a few important links and `intent` for lists.

```tsx
import { Link } from '@askrjs/askr/router';

<Link href="/posts/42" prefetch="intent">
  Post 42
</Link>;
```

Give routes a `staleTimeMs` when a prefetched result should count as fresh;
with the default, the visit still revalidates in the background. Links also take
`replace`, `state` and `scroll` to shape the history entry and scroll behavior.

## Pending state

`navigationState()` tells the UI when the router is waiting on a destination and
when it is refreshing cached data behind a page that already rendered:

```tsx
import { navigationState } from '@askrjs/askr/router';

function RouteProgress() {
  const { pending, to, revalidating } = navigationState();
  // `blocked` holds the href a blockNavigation() blocker refused, if any.
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
covers `navigate()`, links, `updateRouteQuery()`, redirects met while a
navigation resolves, back/forward and tab close. A refused navigation is
reported as `navigationState().blocked`.

```tsx
const unblock = blockNavigation(() =>
  dirty() ? 'Discard your changes?' : false
);
```

Call the returned function when the form is saved or unmounted. See the
[reference](../reference/router.md#blocknavigationshouldblock) for the
back-button trade-offs.

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

## Untrusted redirect targets

A `?next=` value is attacker-controlled. Reduce it with `localTarget()` before
navigating, or refuse anything off-origin with `sameOrigin`:

```ts
import { localTarget, navigate } from '@askrjs/askr/router';

const next = new URLSearchParams(location.search).get('next');
navigate(localTarget(next, '/dashboard'));
navigate(next ?? '/', { sameOrigin: true });
```

## Canonical URLs

`createRouteRegistry(routes, { trailingSlash: 'never', caseSensitive: false })`
redirects `/About/` to `/about` with a 308 on the server and in the browser, so
each page has one URL. See the
[router reference](../reference/router.md#canonical-paths-trailingslash-and-casesensitive).
