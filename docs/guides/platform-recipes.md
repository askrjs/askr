# Verified Platform Recipes

Use these recipes when an application concern crosses the runtime, router,
data, SSR, or SSG boundary. Visual shells, login pages, settings layouts,
tables, and other styled compositions remain package-owned recipes.

## Prerequisites and version contract

The examples are verified against `@askrjs/askr@0.0.95`. Use one locked
`@askrjs/askr` version for the root entry point and every subpath; do not resolve
subpaths independently.

| Recipe                    | Public imports                                                 |
| ------------------------- | -------------------------------------------------------------- |
| Persistent routed shell   | `@askrjs/askr/router`                                          |
| Browser-safe search       | `@askrjs/askr`, `/control`, `/resources`, `/router`            |
| Query hydration           | `@askrjs/askr/data`                                            |
| Error boundary placement  | `@askrjs/askr`, `/components`, `/router`                       |
| Consumer behavior testing | `@askrjs/askr/testing` and the application's configured runner |

If an example also uses `@askrjs/ui` or `@askrjs/themes`, resolve compatible
versions through the application lockfile. This page links to those packages
instead of copying their recipes.

## Recipe index

| Need                                      | Recipe                                                        | SPA | SSR   | SSG   |
| ----------------------------------------- | ------------------------------------------------------------- | --- | ----- | ----- |
| Active navigation in a persistent layout  | [Persistent routed shell](#persistent-routed-shell)           | Yes | Yes   | Yes   |
| Browser listeners and controlled search   | [SSR-safe route-driven search](#ssr-safe-route-driven-search) | Yes | Yes   | Yes   |
| Loading, failure, invalidation, hydration | [Hydrated query data](#hydrated-query-data)                   | Yes | Yes   | Yes   |
| Local and route-level recovery            | [Error boundary placement](#error-boundary-placement)         | Yes | Local | Local |
| Public component and router tests         | [Test the recipes](#test-the-recipes)                         | Yes | N/A   | N/A   |

SSR and SSG entries describe render safety. Client-only lifecycle callbacks run
after hydration, not while server or static output is generated.

## Persistent routed shell

Keep the shell persistent with `group({ layout })`. Read `currentRoute()` during
render so active-link attributes update after navigation, and use `Link` so the
same anchor works in server output and client navigation.

The complete, type-checked example is
[routed-shell.tsx](../../examples/platform-recipes/routed-shell.tsx).

```tsx
import { Link, currentRoute } from '@askrjs/askr/router';

function Navigation() {
  const activeRoute = currentRoute();
  const active = activeRoute.path === '/settings';

  return (
    <Link href="/settings" aria-current={active ? 'page' : undefined}>
      Settings
    </Link>
  );
}
```

Lifecycle and cleanup:

- `currentRoute()` is a render-time snapshot for SPA, SSR, and SSG.
- `onRouteChange()` is for post-commit work in a persistent client shell. Its
  cleanup runs before the next callback and on unmount.
- `onRouteChange()` does not run during SSR or SSG.

Failure and empty states:

- Register a scoped `fallback()` so an unknown path renders a useful recovery
  link.
- Do not hide missing-route behavior inside the navigation component.

`aria-current="page"` is the runtime-owned active-link signal. Navigation
landmarks, labels, focus treatment, and visual active states remain application
or sibling UI/theme responsibilities.

## SSR-safe route-driven search

Store the search term in the route query. A controlled input updates it with
`updateRouteQuery()`, whose default replace behavior avoids one history entry per
keystroke. Read the value from `event.currentTarget`; delegated handlers expose
the matched input as their current target.

Use the resolver form of `on()` for browser globals. The resolver is evaluated
only during a client commit, so importing and rendering the component is safe
during SSR and SSG.

The complete example, including loading, error, retry, empty, and result states,
is [browser-search.tsx](../../examples/platform-recipes/browser-search.tsx).

```tsx
import { on } from '@askrjs/askr/resources';
import { updateRouteQuery } from '@askrjs/askr/router';

function SearchControls() {
  on(
    () => window,
    'keydown',
    (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (
        (keyboardEvent.metaKey || keyboardEvent.ctrlKey) &&
        keyboardEvent.key.toLowerCase() === 'k'
      ) {
        keyboardEvent.preventDefault();
      }
    }
  );

  return (
    <input
      type="search"
      onInput={(event) => {
        const input = event.currentTarget as HTMLInputElement;
        const query = input.value.trim();
        updateRouteQuery({ q: query || null });
      }}
    />
  );
}
```

Lifecycle and cleanup:

- `on(() => window, ...)` attaches after mount and detaches on unmount.
- `resource()` aborts superseded and unmounted search requests. Pass its
  `signal` to `fetch()`.
- SSR and SSG must receive the first resource value as render data. The example
  exports `createSearchRenderData()` for that first `resource()` slot.
- Hydration adopts the server value without a duplicate request. A query change
  or explicit refresh starts the next browser request.

Failure and empty states:

- Treat a successful empty result as a normal state, separate from failure.
- Keep retry explicit through `resource().refresh()`.
- Use a status message for loading and an alert for failure.

The example demonstrates platform state and lifecycle only. Use the
[`@askrjs/ui` composition guidance](https://github.com/askrjs/askr-ui/blob/main/docs/composition.md)
for combobox, dialog, focus, and keyboard interaction ownership.

## Hydrated query data

Define a query once, register its server handler, prefetch into an isolated data
runtime, and serialize that runtime into the rendered document. Hydrate a new
client runtime with the payload before the first `createQuery()` read.

The full server/client sequence is
[data-hydration.tsx](../../examples/platform-recipes/data-hydration.tsx).

```ts
import {
  createDataRuntime,
  createQueryPrefetchContext,
  dehydrateDataRuntime,
  prefetchQuery,
} from '@askrjs/askr/data';

async function createPayload() {
  const runtime = createDataRuntime();
  const context = createQueryPrefetchContext({ runtime, mode: 'spa' });
  await prefetchQuery(context, userById, { id: '123' });
  return dehydrateDataRuntime(runtime);
}
```

For an SSR request, pass `mode: 'ssr'` and the matching
`defineServerQueries()` registry, as the complete example does. SSG can run the
same prefetch for each generated entry and embed that entry's serialized data.

Lifecycle and cleanup:

- Use a request-owned runtime for SSR and a build-entry-owned runtime for SSG.
  Do not share server request caches.
- The component-owned `createQuery()` reader detaches on unmount.
- `invalidate(prefix, { runtime })` replaces stale work for the selected
  runtime.

Failure and empty states:

- First-load failure has `data === null` and needs a retry path.
- Refresh failure may retain the last data; keep it visible and explain that it
  is stale.
- Model a valid empty result as an object or array, not `null` or `undefined`.

## Error boundary placement

Place a local boundary around an optional or independently recoverable widget.
Place a boundary in a route layout when navigation should remain available but
the route body may fail.

Local descendant boundaries render their fallback in SPA, SSR, and SSG. During
SSR and SSG, a route handler can fail before its layout wrapper is constructed;
let the server adapter or static-generation failure policy handle that route
failure. The route-layout boundary remains useful for client navigation and
commit failures.

On the client, the same boundary also protects scheduled post-mount renders,
including a `resource()` result that causes a descendant to throw. Portal
content can recover through the boundary around its logical writer or, when no
writer boundary exists, a boundary around the portal host. Content with no live
boundary still propagates its error to the scheduler.

The tested placements are in
[error-boundaries.tsx](../../examples/platform-recipes/error-boundaries.tsx).

```tsx
import { ErrorBoundary } from '@askrjs/askr/components';

function OptionalActivity() {
  return (
    <ErrorBoundary
      fallback={(_error, reset) => (
        <button type="button" onClick={reset}>
          Retry activity
        </button>
      )}
    >
      <ActivityFeed />
    </ErrorBoundary>
  );
}
```

Lifecycle and cleanup:

- `reset()` clears the captured error and retries the descendant render.
- Change `resetKey` when a route parameter or recovery input should reset the
  boundary automatically.
- Descendant cleanup still runs when the failed subtree is replaced.

Failure and empty states:

- A local fallback should preserve the rest of the page.
- A route-level fallback should retain a safe navigation path.
- Empty data belongs in the component's normal UI, not in an error fallback.

## Test the recipes

Use the public harness with a jsdom test environment. `render()` mounts a
component through the production renderer; `renderRoute()` adds the production
router context. Dispatch bubbling events, flush scheduled updates, and clean up
every owned result.

```tsx
import { afterEach, expect, test } from 'vitest';
import { dispatch, render, type RenderResult } from '@askrjs/askr/testing';

let view: RenderResult | undefined;
afterEach(() => view?.cleanup());

test('keeps the page when a local widget fails', () => {
  view = render(LocalBoundaryRecipe);
  expect(view.root.querySelector('h1')?.textContent).toBe('Account overview');

  dispatch(view.root.querySelector('button')!, 'click');
  view.flush();

  expect(view.root.textContent).toContain('Widget recovered.');
});
```

Keep only one `renderRoute()` active per jsdom realm because it owns the
production router and browser history. The repository regressions exercise the
exact example modules rather than test-only copies.

## UI and theme ownership

Core platform recipes stop at runtime, routing, data, and lifecycle contracts.
Use the sibling package recipes for presentation and interaction composition:

- [`@askrjs/themes` visual recipes](https://github.com/askrjs/askr-themes/blob/main/docs/recipes.md)
- [`@askrjs/ui` component catalog](https://github.com/askrjs/askr-ui/blob/main/docs/components.md)

Those packages own login, admin shell, settings, table, dialog, combobox,
focus-management, and styling details. Keep their versions locked alongside the
application instead of copying their package-owned code into core docs.

## Common pitfalls

- Reading `window` or `document` while rendering instead of inside a lifecycle
  resolver.
- Using `navigate()` for a controlled search field when
  `updateRouteQuery()` expresses the query-only update directly.
- Sharing one data runtime across server requests.
- Treating a successful empty collection as an error.
- Wrapping the entire application in one boundary when a local fallback can
  preserve more working UI.
- Leaving a routed test mounted when the next test starts.

## Next

- [Router guide](./router.md)
- [Resources guide](./resources.md)
- [SSG guide](./ssg.md)
- [Testing guide](../contributing/testing.md)
