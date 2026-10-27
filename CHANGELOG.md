# Changelog

## 0.5.1 - 2026-10-26

### Fixes

- Keep newly started route loader requests joinable when the cache is full, then evict settled entries to restore the cache limit.
- Settle canceled route loader waiters promptly while preserving shared work for remaining navigations; skip loader starts for already-aborted requests.
- Restore radio-group peers when a failed DOM commit rolls back a checked input's name or type change.
- Stop queued hydration interactions if replay is aborted during a handler.
- Serialize static generation into overlapping parent and child output directories within the same process.
- Notify store readers when a failed array truncation has already removed entries.
- Stop a superseded stream before invoking an iterator method whose getter restarted or closed it.
- Ignore late promised stream sources before reading their iterator accessors.
- Preserve each select's selection when replaying queued hydration interactions, including multiple selections.
- Do not start a mutation action when its optimistic callback aborts or resets it.
- Reject a pending mutation canceled before its synchronous action result is published, while invalidating queries for the completed write.
- Roll back a DOM commit if initializing a new textarea's default value throws.
- Roll back earlier DOM writes when capturing an attribute or form-control snapshot fails.
- Invalidate cached inherited scope lookups when `Owner.reset()` detaches child owners, so cleanup in the detached subtree cannot observe stale ancestor context.
- Keep derived computations retryable and selector source values atomic when a custom equality comparator throws, run derived and selector comparators without tracking comparator-only reads, and avoid tracking comparator reads or calling a state comparator twice for one write.
- Stop stale stream generations after reentrant async-iterator accessors, and assimilate resource thenables through captured methods with generation checks across nested resolutions.
- Ensure scheduler queue clearing cancels every dropped job, ignores work enqueued by cancellation hooks during the drop, and reports cancellation failures after cleanup.
- Abort action submissions when their component or data runtime is disposed, including submissions using the default submit-time CSRF sources.
- Detect SSG output collisions and serialize generation locks for paths that are case-equivalent on case-insensitive filesystems; retain a committed site if removing its backup fails.
- Invalidate an incremental SSG manifest before publishing changed output, so a failed or interrupted publication forces a clean full rebuild.
- Publish the incremental SSG manifest only after static assets are copied, so failed asset publication also forces a full rebuild.
- Compare rendered HTML with the published file before skipping an incremental write when their hashes match, preventing hash collisions from leaving stale content.
- Avoid guessing history positions for unindexed fragment entries reached by back or multi-entry traversals.
- Reject SSG routes and static assets that overlap generated HTML, metadata, or manifest paths before publication begins.
- Reject SSR request/route URL mismatches before running loaders and compose explicit render cancellation with the request signal.
- Settle `mutation.execute()` promptly when explicitly aborted, even if its action ignores the signal, while preserving action-provided abort errors and invalidating queries if the late action still commits.

## 0.5.0 - 2026-10-12

- Document the application-owned stable ID pattern for label and description associations, with installed SSR/hydration, keyed reordering, independent roots and native browser qualification.
- Document and execute an optional DOM Testing Library/user-event recipe for
  native component and router harnesses, with scoped accessible queries, input
  and keyboard interactions, async retry, isolated runtime retirement and
  cleanup; qualify browser defaults separately. The integrations are dev-only
  and add no runtime dependency or public export (#755).
- Add typed `appMeta` declaration data to routes, groups and pages, with immutable
  parent-to-leaf `currentRoute().matches` reads and leaf-only `matchRoute()` reads.
  Application metadata is separate from head metadata and is not automatically
  transported in SSR hydration data. See the application route metadata guide.

### Breaking changes

- Require `@askrjs/auth` and `@askrjs/schema` 0.5.x when these optional peers
  are used. Upgrade their packages together with Core.
- Reduce the Core surface from 373 to 342 named/entrypoint pairs while keeping
  all 22 export-map keys. Remove testing `mount`/`queryState` aliases; move
  testing `matchRoute` to its router owner. Remove utilities `ariaDisabled`,
  `ariaExpanded`, `ariaSelected`, `DefaultPreventable`, `FocusLikeEvent`,
  `KeyboardLikeEvent`, `PointerLikeEvent`, and `PropagationStoppable`.
- Retire stateless `isControlled`, `resolveControllable`, and `makeControllable`
  exports and manual `createLayer`, `Layer`, `LayerOptions`, and `LayerManager`
  exports. Remove router `ParsedSegment`, `PageScopeRecord`, and
  `LayoutScopeRecord`; import `AuthContext`/`AuthRequirement` from `@askrjs/auth`.
- Remove SSR `SSRRoute` and SSG `RouteConfig`/`DiscoveredResources`; make
  registry-based `SSGOptions` non-generic. Import `SSRStyleRegistrationValidation`
  from SSR. Import `jsxDEV` from `jsx-dev-runtime` and manual `JSXComponent`,
  `JSXElement`, and `JSXElementType` from `jsx-runtime`.
  See `docs/migration/0.5.0.md` for every replacement and behavior difference,
  and `docs/development/0.5.0-public-api.md` for the complete API decisions.

### Deprecations

- None.

### Additions

- `hydrateSPA()` seeds the route loader cache with the loader data it adopts
  (leaf and group/page loaders), so navigating away from a server-rendered
  first page and back does not run its loaders again while the data is fresh
  (`staleTimeMs`). The data's age counts from the server render, which
  `renderRouteRequest()` records in the hydration data. A leaf with
  `dehydrate()` is not seeded.
- Server rendering renders a route's `error` and `forbidden` components:
  `renderRouteRequest()` and `renderRouteRequestToString()` resolve a loader,
  `preload`, policy or render failure to `{ kind: 'render', status: 500, error }`
  with the `error` component inside the layouts, and a denial to
  `{ kind: 'render', status, denied: true }` with the `forbidden` component.
  Without those components the results are unchanged. `hydrateSPA()` adopts the
  markup; failures reach the page only with `expose: true`. The buffered result
  also keeps its private `record`. See the router reference.
- SSG writes the root `fallback()` as `404.html`, passes the route's resolved
  metadata to the document callback as `context.meta`, runs route `preload`
  prefetches against a page-local data runtime served by a new `queryRegistry`
  option and embeds their data, and reports a parameterized route without
  `entries()` as runtime-only instead of failing the build.

- `blockNavigation()` now also guards a policy or auth redirect met while an
  in-app navigation resolves, so a blocker that starts objecting during
  resolution keeps the page as it is. A message the visitor already confirmed
  for that navigation is not asked again. `updateRouteQuery()` changes the
  page that stays rendered and does not consult blockers. A blocked
  back/forward traversal whose history position is unknown is undone by
  pushing the rendered location again, with its `navigate()` state (one extra
  entry; forward entries are lost) instead of proceeding. `navigationState()`
  gains `blocked`, the href of the latest refused navigation until the next
  one begins.

- Add opt-in view transitions: `navigate(target, { viewTransition: true })`,
  `<Link viewTransition>` and a `viewTransitions: boolean | ((from, to) =>
  boolean)` option on `createSPA()`/`hydrateSPA()` (default off) run the
  navigation commit inside `document.startViewTransition()` when it exists,
  and commit directly otherwise. Back/forward follows the app option. See
  the navigation guide.
- `action()` no longer captures the CSRF token once at render when it has no
  `csrfToken` resolver. Each submission reads, in order, the hydration envelope
  token (until the session identity changes), a `<meta name="csrf-token">`
  element, and the cookie named by the new `csrfCookie` option (default none),
  so a token rotated after login is picked up. `csrfToken` is now optional in
  the options. See the forms guide.
- Report `status: 404` on the SSR render result when a `fallback()` rendered
  the miss, so hosts can send the right status without reading the private
  route record.
- Accept an optional debug `{ name }` in the options of `state()`, `derive()`,
  `selector()` and `store()`, and include it in the loop-guard,
  circular-dependency, unused-state and store write-guard messages. A looping
  component is named by its display name. `selector()` also accepts
  `{ equals, name }` in place of a bare comparator. See
  `docs/core/runtime.md#debug-names`.
- Add the `store(initial)` component hook and `unwrap(proxy)` to `@askrjs/askr`:
  a deep reactive proxy with per-property tracking, lazy nested wrapping with
  stable identity, array `length`/index/iteration tracking, `delete` and key
  tracking. Writes during render throw like `state.set()`. See
  `docs/core/runtime.md#stores`.
- Export `batch(fn)` and `untrack(fn)` from `@askrjs/askr`. `batch` defers
  scheduling and flushes once when the outermost batch exits, from any code
  (handlers, timers). `untrack` reads reactive values without subscribing. The
  surface grows by two named/entrypoint pairs. See
  `docs/core/runtime.md#batching-and-untracked-reads`.
- Add an `equals` option to `state()` and `derive()`: `state(initial, { equals })`,
  `derive(fn, { equals })` and `derive(source, map, { equals })`. A comparator that
  returns true suppresses the notification. The default stays `Object.is`.
  See `docs/core/runtime.md#custom-equality`.
- Add `trailingSlash` (`'ignore' | 'never' | 'always'`) and `caseSensitive`
  options to `createRouteRegistry()`. Non-canonical requests for a matched
  route redirect (308, query and fragment kept) to the canonical form; both
  default to the existing exact, slash-tolerant matching.

- Add `localTarget(value, fallback = '/')` at `@askrjs/askr/router`, which
  reduces an untrusted navigation target to a same-origin root-relative href or
  the fallback, and a `sameOrigin: true` option for `navigate()` that throws for
  any cross-origin target, including an explicit `http(s)` URL.

- Add `replace`, `state`, `scroll` (`'top' | 'preserve'`) and `prefetch`
  (`'intent' | 'render' | 'none'`, default `'none'`) props to `Link`. Prefetch
  starts the route's lazy chunk and resolves it through the loader cache on
  pointer intent, focus or mount.

- Add a `focus` option to `createSPA()` and `hydrateSPA()`. After a navigation
  to another path (not back/forward) the router now moves focus to the first
  `[data-askr-focus-target]`, else `<main>`, else the first `<h1>`, else the
  root, and announces the document title through a visually hidden polite
  live region. Pass `focus: false` to opt out, or configure `target` and
  `announce`.

- Add `navigationState()` (`{ pending, to, revalidating }`, reactive in
  components), `blockNavigation(shouldBlock)` and the `NavigationState` type at
  `@askrjs/askr/router`. A blocker can refuse or confirm `navigate()`, links,
  back/forward traversal (undone through the history index) and `beforeunload`.

- Parse the inbound query string with a route's `search` schema. Loaders,
  `preload`, `meta` and policies receive the typed result as
  `context.searchParams`, and `currentRoute().search` exposes it (typed by a new
  fourth `currentRoute()` generic). Query text is converted to the declared
  types; invalid or missing values take schema defaults, invalid keys are
  dropped and the route never 404s over its query string.

- Cache browser route loader results in the app's data runtime, keyed by route
  template, params and search. Repeat visits and back/forward render the cached
  result at once and revalidate in the background (the route re-renders when
  the new result arrives); concurrent navigations share one request. Add a
  `staleTimeMs` route option (`number | 'always'`, default `0`); drop entries
  with `invalidate('route-data:...')`.
- Add `loader` and `staleTimeMs` to `group()` and `page()`, run beside the leaf
  loader, and `layoutData(loader)` at `@askrjs/askr/router` to read their
  results in layouts, page hosts and leaves, including through SSR and
  hydration.

- Add `error` and `forbidden` component options to `route()`, `page()` and
  `group()`, and the `RouteErrorProps` and `RouteForbiddenProps` types at
  `@askrjs/askr/router`. A failed browser navigation renders the nearest
  `error` component (with `retry()`) at the destination URL; a denied route
  renders the nearest `forbidden` component instead of the bare status
  placeholder. Routes declaring neither keep their behavior.

- Type `download` on `<a>` (a filename, or `true` for the resource's own
  name) and `onDoubleClick` on every element, as an alias of `onDblClick`.

- Add `createSessionAuth()` and its three option/binding types at the router
  owner for same-origin server provider sessions. Adopt a minimal SSR identity,
  dedupe session GETs, construct safe provider links and retire private routed
  data before logout or identity changes. Decoded typed interaction failures
  trigger login or consent recovery without wrapping API transports.
  Session-bound roots own dedicated isolated runtimes; manual auth remains
  independently supported. See `docs/guides/provider-sessions.md` (#777).

- Export the existing `RenderableChild` type from `@askrjs/askr` for component
  presentation props and layout slots, including nested readonly arrays.
  Together with isolated runtime retirement and app runtime replacement, the
  surface before the provider-session binding has 345 named/entrypoint pairs.
  Value children exclude factories; `Scope` retains its explicit factory-child
  contract. See `docs/core/rendering.md#presentation-children`.
- Add `disposeDataRuntime()` at `@askrjs/askr/data` for terminal, idempotent
  retirement of isolated runtimes, including retained readers, queued work,
  mutation rollback, and abort-ignoring requests. Create a new isolated runtime
  after disposal; the shared default cannot be disposed.
  Native prefetch uses the effective `context.signal` combining caller cancellation
  and retirement, rather than preserving the caller signal's object identity;
  disposing the runtime does not abort the caller's own signal.
- Add `replaceDataRuntime(root, next)` at `@askrjs/askr/boot` to switch a live
  routed app or island to another native runtime without remounting its shell.
  Future implicit data hooks and route preloads use the replacement; pending
  navigation from an earlier owner cannot publish. The operation preserves
  component state and does not dispose the previous runtime. Explicitly retire
  an exclusively owned old runtime when changing identity.

- Add aggregate critical-runtime coverage with independent DOM, SSR, data and
  router regression floors, CI source reports, and cleanup/hydration failure
  and recovery probes.

- Add the `hydrate` option to `createIsland` and `createIslands`
  (`@askrjs/askr/boot`). An island adopts the container's server-rendered
  elements by default, or when `hydrate: true`; `hydrate: false` replaces them.

- Add `hydrate: { onMismatch(info) }` to `hydrateSPA` and `createIsland`
  (`@askrjs/askr/boot`). It receives `{ path, expected, actual }` for each
  server/client difference; returning `'continue'` from a verify-mode mismatch
  patches the markup and proceeds instead of failing.

- Type per-handler listener options through prop name suffixes on every
  intrinsic `on*` prop: `Passive` and `Once` (and their combinations with
  `Capture`), for example `onWheelPassive` and `onClickOnce`.

- Accept class arrays and objects on intrinsic `class` and `className`
  (`class={['a', { b: cond }, null]}`), rendered the same way on the client and
  on the server.

- Add jsdom js-framework-benchmark style tier-1 operations (create 1,000 and
  10,000 rows, select a row, remove one row, clear) with preflight invariants.

### Fixes

- Reject a `state.set()` hidden inside `untrack()` from a `derive()` or
  `selector()` with the derived-write error rather than letting it through
  or misreporting it as a render write. `composeRefs()` forwards the
  cleanups its callback refs return and gives `null` only to the refs that
  returned none, object refs included; when one ref throws on attach, the
  cleanups the other callbacks returned run instead of being lost.
- An `error` component renders inside layouts that have the group/page loader
  data that did load before another loader failed, in the browser and on the
  server, and a server render that falls back to the `error` component after
  the page threw keeps the request's identity and layout data. A route with
  group/page loaders waits for every loader to settle before a failure
  surfaces.
- The hydration CSRF token survives a session recovery that repeats the
  identity the server already confirmed (a 401 for an anonymous visitor); it
  is still revoked when the identity changes or the session ends. `action()`
  reads the render-data token ahead of the app's at submit, as `ActionForm`
  does, rejects `{ csrfToken: undefined }`, and names the accepted options
  when it rejects an unknown one.
- A navigation commit that fails inside `document.startViewTransition()` is
  logged like a direct commit failure instead of vanishing with the
  transition's promise. `isRoutePathActive()` canonicalizes the active
  location once per location and route table rather than on every read.
- `matchRoute()`, `isRoutePathActive()`, `currentRoute()` and the activity
  predicates now apply a registry's `caseSensitive: false` and `trailingSlash`
  options the way resolution does (static segments compare case-insensitively
  when the path matches no route as written, and `isRoutePathActive()`
  compares its candidates the same way), and a synchronous server render of a
  non-canonical URL reports the canonical redirect instead of a missing route.

- Resource and stream snapshot fields notify when the same mutable object
  is assigned again (a buffer the source pushed into), so a stream that
  yields one array keeps re-rendering. A comparator or run that throws
  during a stale-chain walk no longer leaves a derived value marked as
  walking, which made later reads stale. Frozen objects can be read through
  a store, and `includes`/`indexOf` on a store array find the raw objects
  the application holds.

- Publish the resolved identity for denied routes too, so a `forbidden`
  component reads the signed-in user. The router's own session redirects
  and fragment-only moves bypass `blockNavigation()`. Route links that
  differ by `hreflang`, `media` or other attributes are no longer collapsed
  when metadata merges. The stale-deployment reload marker clears when a
  navigation that loaded a chunk commits without an error component, not
  when any one chunk loads, so a missing chunk beside a working one cannot
  reload the page in a loop. `action()` composes its abort signal
  once per component on hosts without `AbortSignal.any`.

- Hydration keeps a `data-key` or other bookkeeping-named attribute the
  application rendered itself. `indeterminate`, `muted` and `open` are
  verified against the live DOM on every patch, since the user or browser
  changes them. A falsy number inside a class array or object is skipped,
  as in clsx. The unknown-event-prop warning fires only for a near miss of
  a known event name, so custom events stay quiet.

- SSG prerenders routes under a `group()` or `page()` loader: the group and
  page loaders run beside the leaf loader with the request context, resolve
  `layoutData(loader)` in the static render and transport their data for
  hydration.

- Publish the identity a custom `resolve` produces when its navigation
  commits (and at initial mount), not when it resolves. A page still on
  screen while a navigation is pending, failed or superseded keeps reading
  the identity it rendered with from `currentAuth()`; a rolled-back commit
  restores it. An error page committed after a loader or policy failure also
  receives the identity that resolved successfully before the failure.

- Track symbol properties in stores and preserve the exact raw value of
  frozen symbol properties, avoiding proxy invariant failures. SSG metadata
  sources receive the leaf loader result as `context.data`. The abort-signal
  fallback releases every listener when an input signal is repeated.

- Back and forward between fragment entries skip departure blockers, matching
  fragment-only `navigate()` calls. A native event previously handled by a
  root can be dispatched again outside that root without losing its delegated
  handlers, including when its first dispatch stopped propagation.

- Avoid splitting and parsing identical literal paths in direct route
  matching. Dynamic patterns and paths with empty interior segments retain
  the general matcher and its capture and validation rules.
  Sparse keyed reorders retain unchanged sibling position hints instead of
  rewriting every hint.

- Index route records by their first segment for matching, memoize the last
  match per record list, and detect duplicate routes with a set lookup, so
  matching and registration no longer scale with the whole route table.
  `currentRoute()` returns one snapshot object per committed location, so
  repeated reads compare by identity instead of re-matching the URL.

- Revalidate a provider session in the background when the tab regains
  focus or visibility, or a persisted page is shown. The app is retired and
  re-resolved only when the server identity differs; an unchanged identity
  keeps component state and a navigation in flight. Explicit and cross-tab
  logout hints still retire private state immediately.

- Cache `readScope()` lookups per owner so reading a scope in a deep component
  tree no longer walks the whole owner chain on every read. Provider changes,
  nearer providers and detached subtrees invalidate the cache.
- Update deep chains of `derive()` values without a stack overflow. A write
  marked its dependents and a read brought them up to date by recursion, so a
  chain a few thousand values deep threw `RangeError`. Both walks now use an
  explicit stack; a 10,000-deep chain updates.
- Stop a runaway `queueTask()` loop. A task that queued a fresh closure on every
  run escaped the per-job loop guard and froze the flush. A flush now stops
  after 100,000 jobs beyond those queued when it started, drops the remaining
  queue and reports an error. The "Update loop guard" documentation now
  describes the actual guards (counting applies to every build, there is no
  `onError` hook).
- Log an async `resource()` failure to the console only in development. The
  failure was logged in production as well as surfaced through `.error`; it is
  now only surfaced, and reading `.error` never logs.
- Compare the value of a single `watch()` source with `Object.is`, like
  `state()` and `derive()`. A source function that returns an array was
  compared element by element, so replacing `[1]` with another `[1]` did not
  fire. Only the tuple form (an array of sources) compares entry by entry, and
  it now delivers an array to the callback even for one source, as its type says.
- Make the fields of `resource()` and `stream()` snapshots reactive per field.
  A child component that reads a passed snapshot field now re-renders on its
  own when that field changes, instead of relying on the declaring component to
  re-render, and the declaring component no longer re-renders for results it
  does not read. The snapshot shape and types are unchanged.
- A lazy route chunk that fails to load during navigation now rejects the
  route's resolution, so its `error` component renders it instead of the click
  doing nothing. A failure that looks like a stale deployment
  (`ChunkLoadError`, or the `TypeError` of a failed dynamic import) also loads
  the destination as a fresh document once per session, guarded by a
  `sessionStorage` marker.

- A server action redirect in a routed app is now followed through the router
  (same-origin targets only, as before) instead of `location.assign()`, so the
  destination renders without a document load. Unrouted code still assigns the
  location.

- Merging route metadata no longer repeats `links` with the same `rel` and
  `href` or identical `jsonLd` blocks declared by a group, page and route; the
  most specific link wins.

- Replace direct `AbortSignal.any` use in actions, server-query prefetch and
  provider sessions with a helper that falls back to listener forwarding, so
  hosts without `AbortSignal.any` no longer throw.

- `updateRouteQuery()` now supersedes a navigation that is still resolving, so
  the pending navigation can no longer publish over the updated query.

- Resolve a matched route's lazy chunk, `preload` and `loader` together instead
  of one after another, and start metadata sources in parallel. `meta` functions
  now receive the loader result as `context.data`. A `loader` no longer waits
  for `preload` to settle.

- Navigate to a fragment on the current page without resolving the route
  again: no loader runs and the rendered page keeps its state, for
  `navigate()` and for back/forward traversal between such entries alike.
  A navigation to the current location replaces its history entry instead of
  pushing a duplicate, unless `history: 'push'` is given.

- Subscribe to a reactive source as it is read. A write to a source first
  read in the same run (a `watch()` source or effect that reads and then
  writes the same state), or to a source behind a derived value the run has
  already read, now re-runs the computation instead of being lost until an
  unrelated change. Subscriptions a failed or discarded run made are
  released with it.

- Treat a lifetime created under an already disposed owner (an async
  continuation after unmount) as disposed from the start, so it never
  subscribes or schedules work and cannot leak.

- Count the `derive()` and `selector()` loop guard only inside a scheduler
  flush. Reading a derive more than fifty times between flushes, as an
  event handler that writes and reads in a loop does, no longer throws
  `derive() exceeded 50 runs`.

- Reject navigation `state` that cannot be structured-cloned before the
  destination renders, with a `TypeError` naming the cause, instead of
  committing the page and then failing the history write so the page and
  the URL disagreed.

- Reject empty path segments in route matching. `/users//x` no longer
  matches `/users/{id}/x` with an empty `id`, and `/users//` no longer
  matches `/users`; one trailing slash is still ignored and a splat may
  still capture an empty remainder.

- Restore the signed-in app when a session logout request fails or its
  transport rejects, instead of leaving a blank page in a locally logged-out
  state while the server session is still alive. Reports of one interaction
  failure share its login target only until the navigation to it is issued,
  so a later failure from another page returns the user to that page after
  login rather than the first one.

- Save the departing page's scroll position before its content is replaced
  on a push navigation. Browsers clamp the offset as soon as the document
  shrinks, so a long list followed by a short page previously restored to
  the top on back navigation.

- Reconcile head metadata on every navigation. A route that declares no
  `title` or `meta` now removes the previous route's title, description,
  robots and other owned head nodes instead of leaving them in place, and
  restores the document's own `lang` and `dir` when the router wrote them.
  A shell `<title>` that the document already had is updated in place rather
  than shadowed by a second `<title>`, and is restored when a route has no
  title. A title, `lang` or `dir` the application changed itself is left
  alone, and apps booting into one document share its original values.

- Write a `<textarea value>` as the element's text content in SSR, so the
  control is filled before hydration, and keep that server text in place when
  hydrating; a client-created textarea writes its initial value as its
  default text too, so server and client markup agree. Double a leading newline in
  `<pre>`, `<textarea>` and `<listing>` content so the parsed text matches
  the render, including content produced by function, fragment and component
  children; hydration verification restores that newline when the host
  serializer omits it.

- Render `download={true}` as a bare attribute instead of `download="true"`,
  which named the downloaded file `true`. Accept `onDoubleClick` as an alias
  of `onDblClick`; it previously never fired.

- Ignore the `srcdoc` attribute and `attr:srcdoc` on the client and in SSR,
  matching `prop:srcdoc`: the value is parsed as HTML. Render `blob:` URLs in
  `href`, `action`, `formAction` and `xlink:href`, so generated download links
  work.

- Remove the `value` attribute when the prop is removed from an `<option>`,
  `<button>`, `<li>` or `<progress>` instead of writing `value=""`, so an
  update matches a fresh mount. Inputs, textareas and selects still reset to
  an empty value.

- Render only JSX runtime elements as children. A plain object with a string
  `type`, such as JSON from a loader or an API, no longer creates an element
  or raw HTML on the client or in SSR.

- Keep ordinary CSS functions in style objects. `repeat()`, `minmax()`,
  `translate3d()`, `env()`, `blur()`, `polygon()` and the rest now render on
  the client and in SSR; only URI schemes, resource-loading functions
  (`url()`, `image()`, `image-set()`, `src()`, `element()`) and
  `expression()` are rejected, with CSS escapes decoded before the check and
  preserved in the written value.

- Preserve session transport failures when a supplied fetch throws before
  returning a promise; allow the next resolution to retry without an unhandled
  rejection or cached identity.

- Make removed-export type assertions fail when a value or type is restored.
  Qualify the packed absence checks under TypeScript 6 and 7, and exercise
  the required classic JSX factory for a key written after a spread.

- Preserve newer navigation ownership when an abort listener starts or cancels
  a request, and stop the interrupted request before starting obsolete work.

- Enforce startup locks and component-function checks for index and fallback
  routes, retain a page's index slot after failed registration, and normalize
  root-page fallback paths to `/*`.

- Ignore query results and consistency errors superseded by their own callbacks;
  preserve newer invalidation work created by start or reconciliation abort
  listeners instead of starting obsolete transport or suppressing retries.
- Retire a destroyed query's cache entry before abort listeners run, so a reader
  mounted by that listener acquires a live replacement for the same key.

- Restore hydration render context when claiming SSR resource metadata throws,
  so a failed claim leaves server nodes and the following hydration retry intact.

- Keep server attributes the client never renders when hydrating. A theme
  attribute, a browser extension's marker or any other attribute added outside
  Askr survives adoption. Hydration still removes the renderers' own
  bookkeeping (`data-skip-hydrate`, `data-key`, `data-askr-key-kind`) and an
  attribute whose prop the client renders as `null`, `undefined` or `false`.
  Verify mode (`hydrate.verifyMarkup`) keeps the stricter behavior and removes
  every attribute the client does not render.

- Hydrate `createIsland` over server-rendered markup instead of replacing it,
  so node identity, typed input state, and focus survive. Pass `hydrate: false`
  to keep the old replace behavior.

- Resync hydration after an extra node on either side. Elements and texts are
  aligned with the server's nodes by a longest common subsequence, so a server
  `<i><b><p>` against a client `<b><p>` adopts `b` and `p` instead of
  recreating them.

- Name the first differing node in a hydration mismatch error: its DOM path
  below the root (`main > div:nth-child(2) > p`) and the expected and found tag
  or text.

- Add development-only warnings (silent in production, each reported once) for
  invalid nesting the HTML parser rewrites (block elements in `<p>`, nested
  `<a>`/`<button>`/`<form>`, a server-rendered `<tr>` without `<tbody>`), a DOM
  node or Promise passed as a child, partly keyed dynamic lists, and `on*`
  props that match no DOM event.

- Skip props whose value did not change when patching a host: no attribute,
  class or style read or write, and no per-prop closures. A value that other
  code overwrote while its prop stayed the same is no longer rewritten until the
  prop changes; form control `value`, `checked` and `selected` and `prop:` writes
  are still verified on every render. Also reuse the render context for child
  lists, return the committed child list unchanged when positions match, and
  share the no-op settle callback of reversible commits.

- Clear a host with one `replaceChildren()` when every child is removed and
  the host holds only renderer-owned nodes, instead of one `removeChild` per
  child. A host with nodes added by other code still removes only its own.

- Give every delegated handler the same event object, the native event, with
  `currentTarget` set per handler and a `nativeEvent` property, instead of a new
  `Proxy` per handler; the received event can be dispatched again. Delegate
  pointer events (`pointerdown`, `pointerup`, `pointermove`, `pointercancel`,
  `pointerover`, `pointerout`) and `focusin`/`focusout`. `onFocus` and `onBlur`
  now also run for focus changes inside the element. Skip the `document.body`
  dispatch for an event an app root already handled. `change` and `submit` stay
  direct listeners, because they do not cross a shadow root.

- Assign boolean, number and function values to a custom element's property
  when the element has one by that name (`name in el`) instead of writing an
  attribute; strings stay attributes, and an element that is not defined yet
  still gets the attribute. A function given `prop:` on a custom element is
  assigned as-is instead of being called as a reactive binding.

- Let a callback ref return a cleanup function. It runs when the element is
  removed or the ref is replaced, instead of calling the ref with `null`; a
  ref that returns nothing still receives `null`.

- Compare a `type="number"` input's value numerically, so a re-render does not
  overwrite text such as `1.0` or `1e2` that equals the rendered number.

- Parse string `style` values with a scratch declaration owned by the element's
  own document, so an element in an iframe is parsed by that document and not
  by the first document the renderer saw.

- Write the text children of `<xmp>`, `<iframe>`, `<noembed>` and `<noframes>`
  verbatim on the server, as the parser reads them, instead of entity-escaping
  them (which made the parsed text differ from what the client renders). Only
  `</` is rewritten, so the element's end tag cannot form.

- Write a root's first render and an element's restored children in chunks of
  at most 10,000 nodes, so a very large list does not exceed an engine's
  argument limit for `replaceChildren(...nodes)`.

- Clear a component instance's rendered view and hook values when it is
  disposed, so a retained instance no longer keeps detached DOM and its
  ancestor tree alive.

- Find the DOM node after a component or fragment from a stored, checked
  position instead of scanning its parent's children, which removes the linear
  cost per component in a long list of components that change shape.

- Warn once per element, not on every apply, about `dangerouslySetInnerHTML`,
  and compare the `__html` strings before touching the element: an unchanged
  string no longer reads `innerHTML` or snapshots the children.

## 0.4.4 - 2026-10-08

### Breaking changes

- None.

### Deprecations

- None.

### Additions

- Add lifecycle-owned `refreshOnActivity()` for focus, visible-document return,
  and reconnect hints with an explicit freshness age and shared query ownership.

### Fixes

- None.

## 0.4.3 — 2026-10-02

### Breaking changes

- None.

### Deprecations

- None.

### Additions

- None.

### Fixes

- Retain each queued input or textarea edit and checkbox/radio change during
  hydration, so replayed handlers and a following submit observe the captured
  values even when hydration writes the initial control state. File input
  values remain untouched.
- Preserve native printable typing, Backspace, and Delete in editable text
  controls before hydration. Enter, modified shortcuts, and activation retain
  their existing cancellation; immediately activated deferred key handlers
  can still cancel the native edit.
- Discard events whose target is replaced during deferred activation and
  release root capture listeners when the final deferred boundary completes.

## 0.4.2 — 2026-10-01

- fix(foundations): honor previously cancelled click and keyboard events in
  `pressable()` and `rovingFocus()` while preserving disabled propagation
  suppression and native keyboard activation timing.
- fix(ssr): support private sibling component opt-in to render descendants once
  before ancestor attributes, preserving legacy attribute order and output for
  ordinary hosts, scoped lifetimes, namespaces, portals, and streaming transport.
- fix(ssr): finalize private component reference metadata after the rendered
  root and its portals, preserving ordinary attribute evaluation and error
  boundaries without repeating components or caller ID functions.

## 0.4.1 — 2026-10-01

- fix(data): honor defined-query `skipInitialFetch` and `initialData` options,
  retain prefetched/hydrated data precedence, and retire active or queued
  refreshes when the last reader leaves a query retained by `gcTime` (#724).
- fix(data): retire obsolete requests immediately when invalidation supersedes
  them, preserve every string query key during dehydration, and keep sparse
  query-key arrays from colliding with empty arrays. Dense-array keys are unchanged.
- fix(resources): abort and close failed stream generations, capture stream
  definitions from the committed render, and preserve component ownership in
  listener and timer callbacks so nested FX and invalidation use the owning app.
- fix(core): restore `derive()`/`selector()` definitions and subscriptions after
  a rejected render, and run replacement refs even when previous ref cleanup
  throws.
- fix(core): retain the following server element when hydration adopts merged
  adjacent text nodes, including text claimed through reserved cursors.
- fix(control): preserve native and class instance receivers in `For` rows while
  retaining reactive overlays for plain records and stable keyed row lifetimes.
- fix(foundations): prevent stale collection cleanup from removing a newer
  registration for the same node, and preserve own `__proto__` props in
  `mergeProps()` without changing the output record's prototype.
- fix(router): preserve prototype-named path parameters and query fields without
  changing the prototype of the returned plain records. Server snapshots omit
  browser history state, and hydration omission guards apply only to declared
  omissions rather than inherited object properties.
- fix(router): capture each committed `onRouteChange()` callback and snapshot,
  preserving ordered changes and cleanup when several commits precede a flush.
  Destination snapshots read the matching navigation state before browser
  history is written, and navigation state getters run once per destination.
- fix(ssr): distinguish actual deferred hydration values from ordinary records
  with the same marker keys. Existing generated pages retain their original
  deferred decoding, unambiguous pages retain their existing envelope bytes,
  and the hydration envelope remains version 1.
- fix(rendering): keep attribute names such as `constructor` and `toString`
  literal rather than interpreting them as inherited alias or namespace entries.
- fix(hydration): retain the clicked submit button when replaying a form
  submission after hydration replaces its controls. Failed idle attempts retain
  interaction and visibility retries, and mixed completion paths release their
  replay and scroll listeners after the final deferred section activates.
- fix(ssg): normalize named splat entry parameters while preserving accepted
  raw token spellings, encode dynamic render URLs while preserving existing
  output paths and data override keys, and rebuild
  unchanged routes when their generated HTML is missing.

## 0.4.0 — 2026-09-28

- feat(router): expose `matchRoute(path, { registry })` for synchronous route
  path checks without resolving policies or loading route data. The testing
  helper uses the same implementation.

- fix(core): a component tree too deep for the call stack fails with a
  `RenderDepthError` (exported from `@askrjs/askr`) that explains the limit,
  instead of a bare `RangeError` (or Firefox `InternalError`). It is raised
  where render errors are first caught, so error boundaries, updates, and SSR
  see it. The rendering guide documents the supported depth (#624).

- perf(core): remove quadratic owner, scheduler, and context paths (#612).
  Detaching an owner is O(1) (holes in the parent's child list, compacted when
  they dominate), the render lane is a depth-ordered heap and the effect and
  post lanes are O(1) queues, and each component caches its inherited context
  revision. On the new `tier2-subsystem-core-scaling` bench: disposing 10,000
  sibling owners 50.7 ms to 0.43 ms, 5,000 render jobs 13.4 ms to 0.87 ms,
  20,000 effect jobs 20.2 ms to 2.06 ms, patching a 2,000-deep chain 13.0 ms
  to 0.72 ms (mean).

- fix(jsx): export `createElement` from `@askrjs/askr`. The automatic JSX
  transform in TypeScript, esbuild, Babel, and oxc (Vite) compiles a `key`
  written after a spread (`<Row {...props} key={id} />`) to `createElement`
  from the import source, which previously failed to resolve. It removes the
  development-only `__self`/`__source` props and, like `jsxs()`, marks several
  child arguments as static children (#617).

- fix(foundations): `controllableState()` results destructure like `state()`
  (`const [value, setValue] = controllableState(...)`). `ControllableState` is
  now based on `StateTuple`, so the destructured getter and setter are typed.
  The getter is readable like a `state()` getter, and an updater passed to its
  setter runs once (#621).

- docs(foundations): document stacking dialogs and toasts through one writer
  that owns the layer list and writes it through its own `definePortal()`
  channel, since a portal shows the most recent writer's content (#495). The
  default portal is part of the core client bundle, because every application
  root provides and hosts it; the SSG hydration bundle check now asserts this
  and the SSG guide no longer says otherwise (#611).

- **breaking** refactor(api): control, data, `getSignal` and `onRouteChange`
  each have one import path (#487).
  Migration:
  - `For`, `Show`, `Case`, `Match` and their prop types: import from
    `@askrjs/askr/control` instead of `@askrjs/askr`.
  - `createQuery`, `createQueryCollection`, `defineQuery`, `serveQuery`,
    `defineServerQueries`, `prefetchQuery`, `dehydrateDataRuntime`,
    `hydrateDataRuntime` and the query types: import from `@askrjs/askr/data`
    instead of `@askrjs/askr`.
  - `getSignal`: import from `@askrjs/askr` instead of
    `@askrjs/askr/resources`.
  - `onRouteChange`, `RouteChangeCleanup`, `RouteChangeOptions`: import from
    `@askrjs/askr/router` instead of `@askrjs/askr/resources`.

- **breaking** refactor(api): unused low-level exports are removed (#490).
  `resolveRequest` and `renderResolvedToStringSync` are no longer exported from
  `@askrjs/askr/ssr`. To resolve auth, redirects and status without rendering,
  call `resolveRouteRequest(url, { registry, mode: 'ssr', auth, authContext,
  request, signal })` from `@askrjs/askr/router`. Pass `mode: 'ssr'`
  explicitly (the default is `'spa'` when a global `window` exists) and pass
  `signal` explicitly (it is not taken from `request.signal`). The result may be a plain value or a
  Promise, and errors can throw synchronously, so call it inside an `async`
  function and `await` it to keep the old always-async behavior; to render, use
  `renderToString`, `renderRouteRequest` or `renderRouteRequestToString`. `debounce` and `DebounceOptions` are no longer
  exported from `@askrjs/askr/fx`; use `debounceEvent` for event handlers, or keep a local
  debounce helper for code outside components.

- fix(types): intrinsic JSX typings accept MathML elements (`<math>`, `<mi>`,
  `<mglyph>`, ...), `dangerouslySetInnerHTML` on every element, and the
  `formAction`/`formMethod`/`formEncType`/`formNoValidate`/`formTarget`
  attributes on `<button>` and `<input>`.

- fix(ssr): a `dangerouslySetInnerHTML` payload whose `__html` is `null` or
  `undefined` renders no content, as on the client, instead of the text
  `null`/`undefined`.

- fix(types): `resource<T>(load, deps)` with an explicit result type selects
  the deps overload, `<ErrorBoundary>` accepts function and mixed children,
  and `mergeProps()` returns `MergedProps` (base values win unless `undefined`;
  a key the injected props always supply is required; index-signature props
  keep the intersection) instead of an intersection that could collapse to
  `never`. `MergedProps` is exported from `@askrjs/askr/foundations/utilities`.

- chore(tests): `tests/` is typechecked by `npm run typecheck` (#556).

- fix(types): JSX accepts a `string` or `number` `key` on function components
  whose props do not declare it, as it does on intrinsic elements (#489).

- fix(types): `<For each={items}>` with a `state()` getter or `derive()`
  result types each row as the list element instead of
  `State<T[]> | StateSetter<T[]>`, including nullable getters, which render
  nothing for `null`/`undefined`. A getter that does not return a list is now
  a type error. `ForGetterProps` is exported.

- breaking(types): remove the `EagerControlPrimitive` type and the
  `unknown`-returning `jsx()`/`jsxs()`/`jsxDEV()` overloads left from eager
  control flow, and delete retired runtime declarations that no export
  reached (#489, #610).

- fix(dom): a controlled `<select value>` keeps its value when a child
  component, `For`, or function child adds, removes, or edits its options, or
  an option's text or bound `value` changes, without the select itself
  re-rendering (#608).

- fix(ssr): a value-less `<option>` (no `value`, or `null`/`false`) is
  selected by its rendered text with whitespace stripped and collapsed, as the
  browser's `option.value` reads it, including text from component children
  and raw HTML entities, and excluding script text (#609).

- fix(state): `selector()` releases candidate entries once nothing reads
  them, so querying many distinct values no longer grows it for the
  component's lifetime (#613).

- fix(router): a navigation that changes the pathname remounts the route
  leaf, so `state()`, `task()`, and resources start fresh for the new URL
  (`/user/1` to `/user/2`). Layouts keep their instances and DOM.

- fix(router): when a destination's commit applies but a ref or binding
  throws, navigation completes (history, location, metadata) and reports the
  error. When a failed DOM write undoes the commit, navigation rolls back and
  rethrows, keeping the previous page and location.

- fix(boot): mounting without hydration replaces the container's existing
  content (a loading placeholder, unhydrated markup) instead of rendering
  beside it.

- fix(foundations): an explicit `<DefaultPortal>` unmounted in the flush that
  mounted it no longer hides `<Portal>` content from the automatic host.

- fix(core): renders that are discarded or rewound by an `ErrorBoundary`
  release event delegation and `For` row property reads they created.

- fix(router): `<Resolve>` renders deferred route data after client
  navigation. It claimed its resource hook only while the value was pending,
  so the render after the promise settled failed the hook-order check and the
  pending placeholder stayed on screen.

- fix(boot): `hydrate: { verifyMarkup: true }` no longer reports a mismatch
  when a ref callback updates state after the hydration commit (for example,
  adopting a persisted theme). Client markup passes if it matches the server
  at the commit or after scheduled hydration work settles.

- breaking(api): remove `@askrjs/askr/experimental` and its runtime and
  renderer-host construction APIs. Use the public boot, component, and state
  APIs to mount and extend applications.

- breaking(types): drop the internal `_controlState` field from the published
  `VNode`/`DOMElement` declaration. It exposed the retired runtime's control,
  child-scope, and component-instance shapes, which the rebuilt core does not
  have. No export is removed.

- fix(runtime): retain standalone reactive component updates in packed builds
  by installing the DOM render host when a root is created.

- fix(renderer): forced bulk reuse now propagates key attribute write failures
  and restores a partially written key before changing that row's content.

- fix(renderer): strip the forced positional bulk reuse diagnostic switch from
  production bundles; it remains available in development tests.

- feat(fx): `scheduleRetry()` now returns a `result` promise with the final
  success value, terminal error, or cancellation status. Terminal errors still
  reach the host reporter.

- breaking(runtime): remove the scheduler's mutable `setInHandler` flag.
  Use `runInHandlerScope()` to hold handler permissions for a lexical scope.

- feat(data): mutations support a synchronous `optimistic` callback that
  returns a rollback for failure or abort. Overlapping executions no longer
  abort earlier writes by default; explicit abort cancels all pending writes.

- fix(data): ownerless client queries now evict their cache lookup entry after
  `gcTime` (five minutes by default, or immediately with `gcTime: 0`) while
  the returned handle remains usable.
  SSR request caches retain entries through dehydration.

- feat(data): `createQuery()` accepts `gcTime` to retain settled data for a
  bounded interval after the last component reader unmounts. The default
  remains immediate eviction.

- breaking(runtime): scheduler diagnostic state no longer includes
  `taskCount`; use `queueLength` for pending work.

- breaking(runtime): scheduler diagnostic state no longer includes the
  redundant `executionDepth` field; use `running` or `isExecuting()`.

- fix(runtime): report failed bulk-commit probes and reject work while commit
  state is unknown instead of silently admitting it.

- fix(fx): `raf()` wrappers now expose `cancel()` and remain usable after a
  callback throws.

- breaking(fx): remove `defer(fn)` from `@askrjs/askr/fx`; use the platform's
  `queueMicrotask(fn)` for callback scheduling. `defer(promise)` remains in
  `@askrjs/askr/router` for deferred route data.

- breaking(data): `DataRuntime` no longer exposes test override maps or accepts
  them in `createDataRuntime()` options. Use the query and mutation test
  registries to install fixtures. Both registries now accept an existing
  runtime when a test needs to share one cache and fixture scope.

- fix(types): intrinsic event props now cover the DOM global handler map,
  including animation, composition, drag, media, pointer-capture, and
  transition events. Their `Capture` variants receive the same event type.

- fix(types): intrinsic JSX and `jsx()` refs now use each tag's element type.
  An `<input>` ref can no longer be passed to `<button>`, and callback refs
  receive the correct element type. This includes standard tags outside the
  explicitly tailored intrinsic-prop set.

- breaking(types): Askr's JSX namespace now belongs only to the
  `jsxImportSource` runtime modules. Import `type JSX` from
  `@askrjs/askr/jsx-runtime` instead of using global `JSX`. Misspelled standard
  tags now fail typechecking; hyphenated custom elements remain supported.
  The unused class-component `ElementAttributesProperty` hook was removed.

- docs(scope): mark the published interaction and icon foundation subpaths as
  platform internal contracts for sibling UI and icon packages. Their imports
  and behavior remain available for those packages; application code should
  use the composed UI and icon packages.

- breaking(api): runtime construction and renderer-host extension exports moved
  from `@askrjs/askr` to `@askrjs/askr/experimental`. Change their import path;
  their behavior and signatures remain the same. The root retains application
  primitives. The experimental subpath is for runtime and renderer maintainers;
  `createRuntime()` does not isolate mounted trees.

- fix(renderer): a chain of three or more components of the same type, each
  returning the next directly, now keeps the state of every link when an
  outer link re-renders. The update walk previously failed to find the deeper
  links and recreated them, which also made updating a long chain quadratic in
  its length. Updating a 10,000-component wrapper chain now takes linear time.
  The runtime enforcement docs now state the nesting depths Askr guarantees
  for each tree shape and rendering path: the 10,000-level guarantee covers
  client wrapper chains only, while element nesting, server rendering, and
  hydration recurse and are bounded by the engine's call stack.
- fix(renderer): a component that renders text, or a component whose result
  spans several nodes, no longer gets a wrapper `<div>` on the client. This
  applied when the result was the first render or followed an empty first
  render, including `<Portal>{'x'}</Portal>`, Portal function children,
  wrapper fragments rendering text, and content in the automatic default-portal
  host. The client now places that content among its siblings inside
  `askr-range` comment anchors, matching the server markup. A nested
  component that renders nothing and later renders text keeps its instance
  and state.

- fix(runtime): a failed render no longer leaves a structural function child
  stale. A function child in a component's fragment or array result
  (`<>{() => Array.from({ length: n() }, ...)}</>`) renders as a small
  component; when its update joined a parent render that failed, the rollback
  dropped that update, so the list kept the old item count until `n` changed
  again, even after the parent recovered. The same applied to any child
  component re-rendering on its own state. A rolled-back render now restores
  the update the component was due (a queued run, or a scheduled render it
  superseded), so the component renders again with the current state, as
  fine-grained bindings do since #546.
- fix(runtime): cleanup failures are no longer swallowed in production. When
  an update removes DOM or an app is cleaned up, a callback ref that throws on
  `null`, a listener that cannot be removed, a throwing component cleanup
  function (from a mount operation, task, or watch), or a failing root cleanup
  callback was logged with a development-only warning. Every cleanup step still
  runs, and the failures are now reported with `reportError()` in every build,
  queued until the current task finishes: one report per removed subtree (a
  single failure as-is, several as an `AggregateError`) and one per component.
  Error handlers run after the update, can update state, and cannot roll it
  back. `For` row disposal failures (previously a development-only
  `console.error`), provisional component cleanup failures during a failed
  render (previously dropped), and an async mount cleanup that resolves after
  unmount (previously `console.error`) are reported the same way. A throwing
  ref is no longer called with `null` twice. With
  `cleanupStrict: true`, `cleanupApp()` now throws the failures of descendant
  refs, listeners, and components, including components rendered inside `For`,
  `Show`, and `Case`, instead of dropping them. In hosts without
  `reportError()`, such as jsdom and Node under Vitest, the failures surface as
  unhandled errors; stub `globalThis.reportError` in tests that throw from
  cleanup on purpose.
- breaking(data): `dehydrateDataRuntime()` now throws a `TypeError` naming the
  query key and property path when cached query data is not JSON
  transport-safe (a `Date`, `Map`, `Set`, class instance, bigint, non-finite
  number, `undefined`, accessor, or cyclic value). It was documented as
  dropping non-serializable values, and in practice let `JSON.stringify()`
  turn a `Date` into a string and a `Map` into `{}`. Query data now follows
  the same transport rules as route hydration data. An SSR-mode
  `prefetchQuery()` applies them as each value arrives and
  `renderRouteRequest()` checks the data runtime before returning a streamed
  result, so the render fails before a shell is sent. The shared validator
  walks iteratively, so deeply nested data no longer overflows the stack, and
  a fulfilled deferred that contains itself is reported as cyclic.
- breaking(actions): a failed `action().submit()` now always rejects with an
  `Error` whose message carries the HTTP status (`Action failed (403): ...`),
  including non-JSON bodies on any status. The server value (the envelope
  `error`, or the body itself such as an RFC 7807 problem, whose `detail` or
  `title` is used for the message) is kept as `cause`. It used to throw the
  raw envelope `error` value, and a non-JSON body surfaced as a JSON
  `SyntaxError` that hid the status. 422 validation replays keep their
  `ActionValidationError` shape, and a bodiless success (204, 205, or an empty
  2xx body) resolves with `undefined` and still runs declared invalidations.
- fix(ssr): dehydrated query data now travels in a separate `queries` record
  of the hydration payload instead of the `resources` record, so a query key
  such as `r:0` no longer replaces resource slot data and resource slots are
  no longer hydrated into the client data runtime. HTML rendered before this
  change carries query data under `resources`; a new client bundle hydrating
  such HTML fetches that query data again instead of reusing it.
- fix(data): concurrent `prefetchQuery()` calls for the same key and runtime
  share one in-flight fetch. A joiner still rejects promptly with its own
  `signal.reason`, and starts a replacement fetch as soon as the starting
  context aborts. An `invalidate()` covering the key detaches the fetch: later
  prefetches fetch again, and no caller of the detached fetch stores its
  pre-invalidation result.
- perf(data): invalidation skips invalidation-listener dispatch entirely when
  no listener is registered (listeners come only from
  `createInvalidationRecorder()`).

- fix(runtime): cleanup failures are no longer swallowed in production. When
  an update removes DOM or an app is cleaned up, a callback ref that throws on
  `null`, a listener that cannot be removed, a throwing component cleanup
  function (from a mount operation, task, or watch), or a failing root cleanup
  callback was logged with a development-only warning. Every cleanup step still
  runs, and the failures are now reported with `reportError()` in every build,
  queued until the current task finishes: one report per removed DOM node, one
  per component tree disposed together, and one per update for work that runs
  after the update commits (a single failure as-is, several as an
  `AggregateError`). Error handlers run after the update, can update state, and
  cannot roll it back. `For` row disposal failures (previously a
  development-only `console.error`), provisional component cleanup failures
  during a failed render (previously dropped), an async mount cleanup that
  resolves after unmount, cleanup of the previous route after navigation, and
  mount or commit operations that throw after an update commits (all
  previously `console.error`) are reported the same way. A throwing ref is no
  longer called with `null` twice. With `cleanupStrict: true`, `cleanupApp()`
  now throws the failures of descendant refs, listeners, and components,
  including components rendered inside `For`, `Show`, and `Case` at any depth
  and after re-renders, instead of dropping them; failures during ordinary
  updates of a strict app are reported. A cleanup failure during server
  rendering is thrown from the render call. In hosts without `reportError()`,
  such as jsdom and Node under Vitest, reported failures surface as unhandled
  errors; stub `globalThis.reportError` in tests that throw from cleanup on
  purpose.
- fix(hydration): markup verification (`hydrate: { verifyMarkup }`, on by
  default outside production) now also compares the server HTML with the DOM
  the client renderer produces while hydrating it, so SSR/client renderer
  divergences such as a function child the server rendered empty throw
  `Hydration mismatch detected` instead of passing a server-against-server
  comparison. Both comparisons normalize through the DOM and compare `style`
  attributes by their parsed declarations, so the SSR `color:red;` and the
  DOM's `color: red;` are equal. The client check is skipped for static pages
  hydrated at a client-only query or hash and for pages with server-rendered
  portal content. A mount failure under `hydrate: { deferUntilIdle: true }` now
  rejects `hydrateSPA()` instead of leaving it pending.

- fix(runtime): an `ErrorBoundary` fallback now removes the portal content its
  failed subtree wrote. A component that rendered no DOM of its own (such as
  a writer that returns only `<Portal>`) shared the boundary's host node and
  survived the fallback, so its `Portal` content stayed in the host, still
  mounted, and its cleanups never ran. The fallback now disposes every
  component inside the boundary. This applies to render, function-valued prop
  and control-flow errors, and `reset()`/`resetKey` recovery writes the portal
  again. An explicit `DefaultPortal` host replaced by a fallback (directly, or
  inside a component or `Show`/`For`/`Case`) keeps the portal claimed, so its
  content does not move to the automatic host. During SSR and SSG, portal
  writes made by a subtree whose boundary renders its fallback are discarded
  instead of being emitted.
- fix(events): delegated handlers on app nodes inside an open shadow root
  attached within an app's tree now run, once and in native bubbling order,
  with `stopPropagation()` respected and `event.target` set to the real target
  inside the shadow tree (retargeted to the host outside it). Dispatch follows
  `composedPath()` up to the app root, falling back to the target's ancestry
  when a host's composed path skips ancestors. `change` and `submit`, which
  are not composed and never leave a shadow root, are no longer delegated and
  attach directly to their element, so `onChange` and `onSubmit` run inside
  open and closed shadow roots; each element with one of these handlers now
  carries its own native listener. Delegated handlers inside closed shadow roots,
  and delegated event types dispatched with `composed: false` inside a shadow
  root, still do not run; mount an app inside the shadow root instead.
- fix(state): a `derive()` or `selector()` owned by a component whose
  ancestor is queued to re-render (including a portal writer) or whose `<For>`
  is about to reconcile (including through a `derive()`/`selector()` chain
  feeding `each`) is no longer evaluated in the derived lane with the
  component's stale props. It waits for that render, so a list row being
  removed no longer runs (and throws from) a derive that indexes by its old
  prop; a surviving component still gets the updated value in the same flush.
- fix(router): navigation edge cases. `navigate()` and guard redirects to
  another origin now load that URL with `location.assign()` (or `replace()`)
  instead of rendering its path in-app. A hash that is not valid
  percent-encoding (`#%E0`) no longer throws after the history entry was
  written. `<Link target="_self">` is handled by the router. String targets for
  `navigate()`, `<Link href>` and `redirect()` are always logical below a
  registry `basePath`: `/app/settings` under `/app` now goes to
  `/app/app/settings` instead of being treated as already mounted, and
  development builds warn about such strings. `navigate()`, `redirect()`,
  `loginPath` and `authenticatedRedirectTo` accept a typed destination from
  `to()`, whose public href is used as-is; `RouteDestination` is branded so
  only `to()` creates one. Only targets with an explicit `http:`/`https:`
  scheme may leave the origin: path-like strings that resolve to another host
  (`//evil.example`, `/\evil.example`) throw a `TypeError`, on the client,
  in server redirect decisions, for `loginPath` and at `<Link href>` render.
  A redirect to another origin during the first load is handed to the browser
  instead of rendering its path locally, and an absolute `loginPath` on
  another origin keeps its origin when `next` is appended. Same-origin paths whose
  dot segments collapse to a leading `//` (`/.//evil.example`) are refused
  too, and history writes and document loads receive absolute URLs.
  `history.pushState()`/`replaceState()` calls from `navigate()`, `<Link>`,
  redirects and `updateRouteQuery()` now pass an absolute same-origin URL
  (`https://site.example/page`) instead of a root-relative one, so code that
  wraps or spies on them sees the full URL. Enhanced action redirects are
  checked the same way and assigned as absolute URLs.
- fix(resources): a synchronous `task()` registers its cleanup as it runs
  instead of one microtask later, so removing its owner right after mount
  (for example a function child remounting when its hooks change) runs the
  cleanup before the replacement's task. A task that throws still reports
  the error as before.
- fix(ssr): function children and props, and `state`/`derive` cells passed
  as children or props, now render their current value on the
  server instead of nothing (children) or the function's source text (props).
  Each is called once, untracked, and escaped like a static value, so the
  server markup matches the client and hydration adopts it in place. On both
  server and client, a function child that returns a `state`/`derive` cell
  renders that cell's value (and the client follows it); any other function
  in a function child's result renders nothing. A component that returns a
  function or a cell itself renders nothing, but function and cell items in
  the fragment or array a component returns (for example a layout that
  renders `<>{props.children}</>`), and a function child of `ErrorBoundary`,
  now render reactively on the client as they do on the server; the client
  dropped them. `ErrorBoundary` no longer wraps text or fragment content in a
  `<div>` on the client. A function child may use hooks
  (`state()`, `resource()`, `task()`, `watch()`), `Show`/`For`/`Case` and
  `readScope()` in every position, on both sides. The server renders each
  one as a `FunctionChild` component; on the server these threw. On the
  client, an element's function child that only reads values stays a direct
  DOM binding, and upgrades in place to a mounted `FunctionChild` component
  the first time a run asks for a component (code before the first hook then
  runs again); a function child whose hooks change between runs remounts
  with fresh state rather than reporting a hook-order error. Before, hooks there rendered
  nothing, resources never resolved, and `readScope()` could read the wrong
  provider. A function child of `Portal` now renders on the client. Parent
  re-renders no longer remove the text of an element's function child when
  the element is a component's root (`<div data-n={n}>{() => o()}</div>`),
  also with element siblings. Hydrating an element returned by a function child now sets up that
  element's own function children instead of clearing them. A function
  child that throws on the client now goes to the nearest `ErrorBoundary`,
  or is thrown from the update without one, like a reactive prop; it was
  logged and swallowed, leaving the element empty, while the server
  rendered the boundary's fallback.
- fix(renderer): a child list that starts with an item that renders nothing
  (a plain object, a function, `true`) no longer duplicates the following
  text or elements when it updates existing nodes, such as server markup
  being hydrated (#544).
- fix(ssr): `renderResolvedToStringSync()` no longer throws "no route found"
  for a route without params when `params` is omitted.
- fix(renderer): a component returning a fragment or array now retains its
  child components when it re-renders with new props. Matching children keep
  their state and DOM identity, including after hydration; nested fragments
  reconcile against the same flattened child list used at creation.
- fix(control): existing `For` rows now render with the latest row callback.
  A value the parent computed during render and captured in the callback (for
  example `const current = selected()`) kept its first value in rows that were
  already mounted. When the parent rerenders with a new callback, retained rows
  rerun with it and keep their DOM, key, and local state; a stable callback
  still skips them. A row that reruns on its own, because it read a reactive
  value, now keeps its key: a component in that row previously lost its local
  state when the row rendered again in the same flush. The docs now also state
  that a reactive read inside the callback subscribes the row that made it
  (they previously said it did not subscribe). See docs/guides/control-flow.md.
- fix(renderer): a failed keyed reconciliation commit now propagates to the
  component update, which rolls the DOM back and routes the error to the
  nearest `ErrorBoundary` (or throws it from the flush). Previously any commit
  error was swallowed and the parent was rebuilt with `replaceChildren()`,
  which also tore down children that were being reused. Errors from grouped
  blueprint bindings (the second and later instances of a component or `For`
  row) and from reactive child functions (`{() => ...}`) now reach the nearest
  `ErrorBoundary` like single reactive props, or are thrown from the update
  when there is none, instead of a development-only warning. A reactive child
  update that fails while changing the element's children is rolled back
  instead of left half-applied.
- fix(fx): errors thrown by `scheduleTimeout`/`scheduleIdle` callbacks, by
  handlers run later by `debounceEvent`/`throttleEvent`/`rafEvent`, and by
  `scheduleRetry` (a synchronous throw, the last attempt's rejection, or a
  throwing `backoff`) are reported with `reportError()` like
  event handler errors, instead of only being logged.
- build(deps): `@askrjs/auth` and `@askrjs/schema` are now optional peer
  dependencies instead of dependencies, so apps that do not use route auth or
  schemas no longer install auth's SAML/XML stack. Askr uses them for types
  only: route requirements are composed by Askr itself, and the published
  declarations typecheck without either package installed. Apps that use
  `@askrjs/auth` or `@askrjs/schema` must list them in their own
  dependencies.
- fix(ssg): the `@askrjs/askr/ssg` declarations no longer contain a stray
  `import 'node:fs/promises'`, so consumers without `@types/node` typecheck.
- test(test-utils): `npm run typecheck` (and so `npm run lint`) now also
  typechecks `test-utils/**`, including the Playwright browser app, through
  `test-utils/tsconfig.json`. The existing type errors are fixed: fixtures
  import `state` from the root entry, the playwright app's Vite config uses
  `oxc.jsx`, and two scenarios no longer rely on unsafe nullable state reads.
- test(benches): `npm run typecheck` also typechecks `benches/`. Bench fixtures
  now use `htmlFor`, a numeric `tabIndex`, `RouteHandler` route handlers and a
  complete auth context, matching the public types.
- perf(env): development/production checks and renderer debug-flag reads no
  longer copy `process.env` on every call. `isProductionEnvironment()` runs on every component render, and
  enumerating the environment is expensive on Windows, where it dominated
  deep component trees (a 10,000-deep chain took ~60s in jsdom on Windows CI;
  it now mounts in ~0.1s locally, down from ~2.9s).
- test: scheduler tests now exercise the behaviour their names describe
  (render-time writes, nested handlers, `scheduleEventHandler` deferral,
  mid-flush lane order, the render-time write guard error), the runtime and
  native owner-view consumer contracts assert observable behaviour instead of
  private fields, and the browser form tests wait on the
  pending render instead of wall-clock timing.

- fix(ssr): `renderRouteRequest()` streams each deferred `Resolve` boundary as
  soon as its value settles instead of awaiting boundaries one at a time in
  declaration order, so a slow boundary no longer holds back faster ones.
  Patches can arrive out of order; boundary ids stay deterministic. A `Resolve`
  rendered inside a settled boundary's content now streams too (id `d:0.0`
  under `d:0`) with the same request route state and auth, where its fallback
  was previously never replaced.
- fix(renderer): a failed render no longer leaves fine-grained bindings
  (function-valued props and children) stale. A binding whose function the
  render replaced kept the new value after the DOM rolled back, so later
  renders saw nothing to change, and an update the binding was due to run in
  the same flush was dropped. Bindings now roll back with the render and then
  catch up with their state; see "Fine-grained bindings and rollback" in
  docs/core/rendering.md.
- fix(control): development and production now agree on invalid `For` keys and
  `Case`/`Match` children. A null, undefined, or duplicate `For` key throws in
  every build (production previously dropped rows and showed the last
  duplicate's data), and a non-`Match` child of `Case` or a `Match` outside a
  `Case` throws in every build (production previously dropped it). These errors
  reach the nearest `ErrorBoundary`, including a duplicate key introduced by a
  boundary-local list update, a list inside a `Show`/`Case` branch, and an
  invalid `Case` child, which previously escaped the boundary. Component
  errors rendered inside a `For`/`Show`/`Case` created above an
  `ErrorBoundary` now reach that boundary too. `For` resolves each row key
  once per update, and the development-only key-type-change check (which could
  never fire) is removed.
- fix(renderer): props whose live state is not the attribute now set the DOM
  property. `<video muted>` sets `video.muted` (and keeps the attribute),
  `<input indeterminate>` sets `input.indeterminate` without an attribute, and
  object/array values on custom elements are assigned as properties. New
  `prop:name` and `attr:name` escape hatches force either path. SSR renders
  only attribute-backed values; property-only values apply on hydration. Removed
  properties reset to their default, property writes roll back with a failed
  commit, and the escape hatches keep the URL and raw-HTML guards.
- fix(renderer): delegated event handlers now match native dispatch.
  Delegated listeners attach at each app root instead of `document.body`, so
  apps mounted in shadow roots or iframes receive events and nested apps each
  dispatch their own handlers once. Non-bubbling events (`focus`, `blur`,
  `scroll`) attach directly to their element, so an ancestor's `onScroll` or
  `onFocus` no longer runs, ancestor-first, for a descendant. `onWheel`,
  `onTouchStart` and `onTouchMove` attach directly with `{ passive: false }`,
  so `preventDefault()` in them takes effect. Hydrated nodes use the same
  delegated listeners as client-rendered ones, so a client-rendered child's
  handler runs before (and can stop) a hydrated ancestor's handler.
- fix(renderer): `onFocus` and `onBlur` no longer bubble: they only run when
  their own element gains or loses focus, as with native `focus`/`blur`.
  Container components that tracked focus inside a subtree with `onFocus`/
  `onBlur` should migrate to `onFocusIn`/`onFocusOut`.
- fix(resources): a `resource()` deps change seen by a render that is rolled
  back (for example because a sibling component throws in the same render) no
  longer leaves the resource stuck `pending`. The new deps, loader and generation are
  committed with the render, so the next committed render still starts the
  fetch, and one back on the committed deps keeps the committed value.
- breaking(data): raw-string `invalidate(prefix)`, `invalidateOnInterval()`
  and mutation `affects` prefixes now match whole `:`-delimited key segments.
  `invalidate('user:1')` still matches `user:1` and `user:1:permissions` but no
  longer matches `user:10`; prefixes ending in `:` (including every
  `queryScope()` prefix) match as before. Only `:` is a segment boundary, so
  raw prefixes built with other separators no longer match by text:
  `invalidate('/api/users')` no longer matches `/api/users/1`, and
  `invalidate('a.b')` no longer matches `a.b.c`. Move such keys to `:`
  delimiters or `queryScope()`.
- fix(boot): `createSPA({ dataRuntime })` and `hydrateSPA({ dataRuntime })` now
  use the configured runtime consistently. `hydrateSPA` previously seeded the
  custom runtime from the hydration payload while route-component queries read
  the default one, so readers showed a loading state and refetched instead of
  using the hydrated value. Route `preload` hooks (initial route and client
  navigations) also prefetched into the default runtime, so readers of a
  custom runtime never saw the preloaded data.
- feat(ssr): `escapeHtml()` from `@askrjs/askr/ssr` escapes `&`, `<`, `>`, `"`
  and `'` for request-derived values interpolated into a hand-written
  `document` renderer template. It accepts any value; `null` and `undefined`
  become an empty string. The SSR, SSG and rendering guides now use it.
- docs: fix examples that failed at runtime. The API overview and core data
  guide no longer call `state()`/`derive()` at module scope, the quick-start,
  resources, core data and resources reference `resource()` examples check `error` before `pending || !value` so a failed first load no
  longer shows "Loading..." forever, and the runtime-enforcement examples now
  actually trigger the documented hook-order and render-mutation errors and
  quote the real message. Doc fences tagged `run=<id>` are now imported and
  exercised in jsdom by `npm run test:checks`
  (`tests/checks/docs/runnable-snippets.test.ts`), not only type-checked.
- fix(renderer): event handler errors are reported with `reportError()`, which
  dispatches a `window` `error` event, instead of only being logged. This covers
  delegated and direct listeners and `scheduleEventHandler`; the remaining
  handlers for the event still run. Hosts without `reportError()` (Node, jsdom)
  rethrow the error from a microtask, so it arrives as an `uncaughtException`
  and test runners that fail on unhandled errors report it. Errors thrown by
  function-valued (reactive) props now reach the nearest `ErrorBoundary`
  (including one whose direct children contain the binding; bindings in a
  fallback go to the boundary above), or are thrown from the update when there
  is none. Previously they were a development-only warning and silent in
  production.
- fix(renderer): keyed fast paths no longer catch errors and retry through a
  slower path. A row whose render throws now renders once per update instead of
  up to three times, and the error surfaces once. Production commits no longer
  capture an `Error().stack` for diagnostics.
- chore(bench): the benchmark workflow runs only the existing tier1 and tier2
  lanes, as one matrix job per tier, instead of 36 copy-pasted steps that also
  invoked the removed `bench:tier3`/`bench:tier4` scripts. The browser-only
  `precise_clock` input and its dead tier3/4 config are removed, artifacts are
  uploaded per tier (`bench-results-stable-tier<N>`), and docs no longer
  describe the deleted lanes, their guardrails, or hydration timings taken from
  them. A `tests/checks` guard fails on bench scripts, configs, or files that
  docs and workflows reference but do not exist.
- chore(agents): AGENTS.md now explicitly allows maintainer-run release tooling
  (`scripts/publish-order.mjs`) and prefers workflow matrices over copy-pasted
  steps; `tests/checks` fails on any unlisted `scripts/*` file.
- fix(router): when several page `fallback()`s match a URL, the deepest page
  prefix (counted in segments) now wins on the client and in sync and async
  SSR. Previously the longest prefix string won, so an encoded prefix such as
  `/caf%C3%A9` could outrank a deeper `/café/x`.
- fix(router): registering two routes that match the same URLs now throws
  `Duplicate route path` instead of silently shadowing the second. Routes are
  compared the way they match: parameter and splat names, trailing slashes and
  percent-encoding of static segments are ignored, a `*` wildcard equals a
  param, and a `fallback()` equals a named splat at its prefix. Each registry
  is checked separately. Declare a template once and use `entries()` for its
  pages.
- fix(router): `fallback()` inside a parameterized page such as
  `page('/{lang}')` now handles misses under `/en/...` (and receives `lang`)
  instead of matching only the literal `/{lang}/...`.
- fix(ssg): `invalidationKeys` passed to `route()` were dropped from the
  registry, so incremental generation treated those routes as keyless and
  always rebuilt them. They now apply to every page the route's `entries()`
  generate.
- fix(boot): error messages no longer point at a nonexistent `createSSR`; they
  name `createSPA`/`hydrateSPA` (and `createIslands`). Removed the unreachable
  redirect branches in `createSPA`/`hydrateSPA`, and sync SSR now matches
  routes against the registry's manifest records like async SSR does.
- fix(ssr): async render contexts resolve `AsyncLocalStorage` from
  `globalThis.AsyncLocalStorage` or `process.getBuiltinModule('node:async_hooks')`
  instead of `new Function('return require(...)')`. Previously synchronous
  `withRenderContext()` could not accept async callbacks under Node ESM (where
  that loader never resolved `require`), and async render contexts were
  rejected under a CSP without `'unsafe-eval'` and on runtimes without
  `process.versions.node`. Any runtime that provides `AsyncLocalStorage`
  globally or via `process.getBuiltinModule` is now supported; see the SSR
  guide.
- fix(runtime): `cspNonce()` decides whether a render scope is active from
  scope state instead of matching the text of `readScope()`'s error message.
- fix(runtime): `state.set()` now throws when called inside a `derive()` or
  `selector()` computation, including recomputes in the derived lane where no
  component is rendering. Previously only render-time recomputes were caught
  (by the render-mutation guard), so a derived-lane write went through
  silently and could loop. A same-value (no-op) `set()` is still allowed.
- fix(runtime): an error thrown by the renderer while marking reactive props
  dirty is no longer swallowed. Component readers of the source are still
  notified, then the error is rethrown to the writer (or aggregated by the
  scheduler inside a flush). If notifying readers also fails, both errors are
  thrown together as an `AggregateError`.
- fix(router): `hydrateSPA()` no longer redirects a server-authorized page to
  the login route when the browser cannot resolve the identity itself (for
  example httpOnly-cookie sessions). Apps opt in with the new
  `auth.dehydrate(context)` hook, which selects the minimal identity snapshot
  (`authenticated`, `principal`, `tenant`, `scopes`; never the session)
  serialized into the hydration payload. Hydration uses it for the initial
  route; navigations use `auth.resolve`, or keep the snapshot when no resolver
  is configured. Nothing about the identity is serialized without the hook.
  `RouteAuthOptions.resolve` is now optional.
- fix(fx): `scheduleTimeout()`, `scheduleIdle()` and `scheduleRetry()` now
  cancel pending work when the component that scheduled them unmounts, as
  documented. Calls made from a mounted component's `task()`, `watch()`
  callback, mount/commit operation or event handler bind to that component's
  lifetime, including portal content (owned by the writer) and handlers
  wrapped by `debounceEvent()`, `throttleEvent()`, `rafEvent()` or
  `scheduleEventHandler()`. Scheduled callbacks and retry attempts run as the
  scheduling component, so work they reschedule (for example a polling loop)
  also stops on unmount, and a stable portal handler follows the writer that
  last rendered it. A synchronous scheduler flush inside a handler no
  longer runs unrelated queued work as that handler's component. Previously no
  cleanup was ever registered and timers fired after unmount. The unreachable
  SSR branches in these helpers are removed, and `scheduleRetry()` settles
  when `fn` throws synchronously or returns a non-promise.
- fix(fx): `throttle(fn, ms, { leading: false })` waits the full interval
  after an idle gap instead of firing on the next tick, and a throttle without
  a trailing edge no longer retains the last arguments.
- fix(fx): `debounceEvent({ leading: true })` and the default
  `throttleEvent()` no longer call the handler twice for a single event. The
  trailing edge only runs when another event arrived after the leading call.
  Both now share their edge logic with `debounce()` and `throttle()`, and
  `debounceEvent().flush()` only runs a pending trailing call.
- fix(foundations): `mergeProps` no longer lets a `base` value of `undefined`
  overwrite an injected prop. Forwarding an optional prop that was not supplied
  (`onClick={props.onClick}`) used to wipe the primitive's handler or ARIA
  attribute; `undefined` now means "not provided". Pass `null` to clear an
  injected prop explicitly; intrinsic `on*` handler props now accept `null` in
  their types. `mergeInteractionProps` still lets the policy own `disabled`, so
  an enabled native policy clears a fixed `disabled` from the user or child.
- fix(data): an inline `createQuery({ key, fetch })` no longer warns about a
  conflicting shared query definition on every re-render, and no longer keeps
  the first render's `fetch` closure forever. The reader that defines a key
  now replaces its `fetch`, `isConsistent`, and `reconcile` on each render;
  only other readers of the same key with a different definition warn, after
  the current render work settles (a keyed row replacing the owner does not
  warn). When the defining reader unmounts, a remaining reader's definition
  takes over immediately. An in-flight fetch is checked and reconciled with the
  callbacks it started with. `createQueryCollection()` entries are redefined on
  each update, so `retry()` fetches with the entry's current `input`.
- fix(ssr): text children of HTML `<script>` and `<style>` are written verbatim
  instead of entity-escaped, so `a > b` no longer becomes `a &gt; b` and breaks
  the CSS or JavaScript. In styles every `<` becomes the CSS escape `\3c `; in
  scripts every `</`, `<script` and `<!--` is rewritten (JSON-safe), so content
  cannot close the element or an ancestor. Text stays entity-escaped inside SVG
  or MathML, `<style>` inside `<select>`, and under raw text or RCDATA ancestors
  such as `<noscript>` and `<textarea>`. Element children inside these elements
  now throw during SSR.
- fix(router): route precedence is decided segment by segment, as documented:
  the first segment where two routes differ picks static > param > wildcard >
  splat, so `/docs/{*rest}` now beats `/{lang}/{page}` for `/docs/intro`
  instead of losing on a summed score. SPA, SSR and SSG share the ordering.
  `RouteRecord.rank` now encodes this order and its numeric values changed.
- fix(router): static route segments, `fallback()` prefixes and registry
  `basePath` values are compared against decoded URL segments, so routes such
  as `/café` and `/a b` (and fallbacks or registries mounted under them) match
  `/caf%C3%A9` and `/a%20b` on the client, in SSR and in SSG. Malformed
  encodings do not throw.
- fix(router): the `*` capture of wildcards, catch-alls and fallbacks is now
  percent-decoded like param and splat captures (`café`, not `caf%C3%A9`).
  Encoded separators `%2F` and `%5C` now stay encoded in every capture,
  including params and named splats, which previously decoded `%2F` to `/`:
  `/files/..%2F..%2Fetc` captures `..%2F..%2Fetc`, not `../../etc`. `to()`
  passes kept `%2F`/`%5C` through, so captures round-trip to their URL.
- fix(renderer,ssr): camelCase SVG presentation props such as
  `strokeDasharray`, `fillOpacity`, `stopColor` and `clipPath` now render as
  their hyphenated attribute names, and `xlinkHref`/`xmlLang`/`xmlSpace`/
  `xmlnsXlink` render as namespaced `xlink:`/`xml:`/`xmlns:` attributes (set
  with `setAttributeNS` on SVG and MathML elements on the client). Previously
  only five SVG names were mapped and the rest were written verbatim, which
  browsers ignore. The mapping also applies to HTML elements, so a prop such
  as `fontSize` or `pointerEvents` on a `<div>` now renders `font-size` or
  `pointer-events` instead of `fontsize`. Custom elements (tag names with a
  `-`) keep their prop names as before. The SVG prop types now list the
  presentation attributes.
- fix(renderer,ssr): numeric `style` values get a `px` unit on non-unitless
  properties, so `style={{ width: 10 }}` renders `width:10px` instead of the
  invalid `width:10`. Unitless properties (React's list plus
  `font-size-adjust`, `initial-letter` and `math-depth`, with or without a
  vendor prefix), `0` and custom properties are unchanged. `ms`-prefixed names
  such as `msFlexPositive` now render as `-ms-flex-positive`.
- fix(renderer,ssr): `false` renders `"false"` for the enumerated attributes
  `draggable`, `spellCheck`, `contentEditable` and `writingSuggestions`
  instead of removing them, so
  `<img draggable={false}>` is no longer draggable. Their prop types now accept
  booleans.
- breaking(data): `defineQuery()` fetchers now receive the input and the abort
  signal as separate arguments, `fetch(input, { signal })`, instead of one
  merged `{ ...input, signal }` object. The merged shape dropped primitive
  inputs (a `QueryDefinition<number, ...>` fetcher only saw `{ signal }`) and
  let the abort signal overwrite an input field named `signal`. Rewrite
  `fetch: ({ id, signal }) => ...` as `fetch: ({ id }, { signal }) => ...`.
  Old-style fetchers with an annotated parameter
  (`({ id, signal }: { id: string; signal: AbortSignal })`) still compile at
  the `defineQuery()` definition but fail to typecheck at the `createQuery()`
  call site; move `signal` to the second argument.
  Inline `createQuery({ key, fetch })` fetchers are unchanged.
- fix(router): client navigation no longer dead-ends on URLs no registered app
  can render. A `Link` click or `navigate()` to an unmatched same-origin URL, or
  one outside the registry `basePath`, now loads the URL as a document, and
  Back/Forward to an unmatched entry reloads the page instead of leaving the old
  page mounted under the new URL. A `fallback()` route still renders in place.
  Navigating to the already-loaded URL with no route, or a fragment-only
  Back/Forward on such a page, skips the load. A failed Back/Forward render or
  rejected Back/Forward loader now returns with `history.go()` to the entry whose page
  is still rendered instead of overwriting the entry the user landed on; Askr
  stamps an `askrIndex` position into the history state it writes and reloads
  when an entry written by other code makes positions unknown.
- fix(resources): a resource hydrated from preloaded data keeps its value on
  later re-renders instead of resetting to pending and refetching. The preloaded
  value now seeds the resource, so `refresh()` and `deps` changes also work
  after hydration.
- fix(ssr): deferred `Resolve` boundaries now render with the request URL, route
  table, base path and params. Previously the streamed boundary saw the root
  path with empty params, so `currentRoute()` and `Link` produced the wrong HTML
  and hydration reported a markup mismatch.
- fix(data): SSR `prefetchQuery()` no longer throws a `TypeError` in
  development when a query has no registered server handler. The
  skipped-preload warning is tracked per runtime outside the frozen
  `DataRuntime`, so it logs once per query key and resolves `false` as intended.
- fix(runtime): `derive()` no longer serves a value computed by a previous
  render's closure (for example after a second render in the same flush from
  `watch()` or `task()`, new props, or a local read from another derive). A
  source change evaluates the derive once with the last render's function and
  skips the owner re-render when the value is unchanged; when it changed, the
  owner re-renders and evaluates its new function once more. A render-time
  recompute of `derive()` or `selector()` now notifies downstream readers, so
  derived values in other components no longer stay one update behind.
- fix(runtime): hook-order enforcement now catches a render that claims fewer
  hooks than the first render, and a slot whose hook kind changes (for example
  `derive()` where the first render called `state()`). Previously only extra
  hooks threw; skipped or swapped hooks passed silently. Messages name hooks by
  their public API (`createQuery()`, `onRouteChange()`, `<For>`). The unreachable
  monotonic index check is removed, and the internal `ComponentInstance`
  field `expectedStateIndices` is replaced by `expectedHookKinds`.
- fix(renderer): re-renders no longer strip attributes, class tokens and inline
  styles added by other code (focus traps setting `aria-hidden`/`inert`,
  animation libraries setting `style.transform`, tooltips adding `data-*`,
  `classList.add`). Prop reconciliation now diffs against the props Askr last
  applied to each element instead of the live DOM, so only what Askr rendered is
  removed or patched.

- fix(ssr): sync `renderToString({ url, registry })`/`renderToStream()` no
  longer follow auth redirects or render a denial marker with an implicit 200.
  Redirect and deny decisions throw the new `SSRAccessDecisionError`, whose
  `decision` matches what `renderRouteRequest()` returns. The sync path also no
  longer starts route loaders: a loader route throws `SSRDataMissingError`
  naming the route and pointing to `renderRouteRequest()`, and abandoned async
  resolution no longer leaks an unhandled rejection.
- breaking(ssr): sync `renderToString({ url, registry })`/`renderToStream()`
  no longer follow auth redirects or render a denial marker with an implicit 200. Redirect and deny decisions throw the new `SSRAccessDecisionError`, whose
  `decision` matches what `renderRouteRequest()` returns. The sync path also no
  longer runs route loaders: any route that declares a loader, including
  a synchronous one that previously rendered, now throws `SSRDataMissingError`
  naming the route and pointing to `renderRouteRequest()`, before its preload,
  lazy import, or loader starts. Abandoned async resolution no longer leaks an
  unhandled rejection, and lazy routes whose component is already loaded now
  resolve synchronously.
- fix(runtime): an update loop that trips the scheduler's `MAX_FLUSH_DEPTH`
  guard no longer aborts the flush. The looping task is dropped and its error is
  reported together with earlier task failures, remaining queued work still
  runs, a dropped component update re-renders on its next write, and
  production builds now fail such a loop instead of hanging. Effects,
  `derive()` and `selector()` are now each limited to 50 runs per flush,
  counted across lanes, so a reactive cycle through them (including
  derive-to-derive cycles that previously hung inside one batch) stops at the
  looping entry without stranding sibling work.
- fix(router): `currentAuth()` no longer falls back to the process-wide client
  identity during server rendering. A server render without request auth now
  sees an anonymous identity, and server-mode route resolution no longer writes
  the client identity, so one request cannot observe another request's user.
- fix(ssr): rejected `defer()` values no longer serialize the server error
  message into the hydration payload. The client receives a generic reason
  unless the error sets `expose: true`.
- fix(renderer,ssr): drop `javascript:` and `vbscript:` URLs from `src` and
  `data` attributes (for example `<iframe src>` and `<object data>`) on both
  client and server. `data:`, `blob:` and custom-scheme resource URLs are
  unchanged.
- fix(data): hydrated or prefetched query data is now consumed by the first
  client reader for its key instead of staying in `runtime.queryData` forever.
  After a `refresh()` and a remount, the query fetches again instead of
  reviving the original server value as fresh, and consumed entries no longer
  accumulate on the default runtime. Server renders still read without
  consuming. Prefetches (including route `preload`) skip keys a mounted query
  already owns and discard results that resolve after a reader mounted. The
  browser keeps at most 50 unread prefetched entries per runtime, evicting the
  oldest; server and SSG payload building is not capped.

## 0.3.1 — 2026-09-12

- fix(boot): move the SSR style registry carrier out of the hydration root
  before mounting. `@askrjs/server` prepends the collected styles to the page
  body, so they arrive as the first child of the mount root; that extra element
  made the root's child list disagree with the rendered tree, which both cost
  the app in-place hydration (the server node was replaced rather than adopted)
  and discarded the carried CSS during reconciliation. The carrier now moves to
  `<head>`, where it still applies and no longer participates in reconciliation.

## 0.3.0 — 2026-09-11

- refactor(internal): rename `src/compatibility/` to names that describe what it
  is — `src/public-contracts/`, `src/renderer/`, `src/runtime/` — and drop the
  re-export shims under `src/compatibility/entries/`. The published `exports`
  map is unchanged; every public subpath resolves exactly as before. This is
  breaking only for code deep-importing `dist/` internals.
- feat(runtime): add a single component scope primitive.
- fix(runtime): reuse a context-free default abort reason during component
  teardown so retained signals do not retain departed component generations.

## 0.2.4 — 2026-08-28

- feat(router): expose entry-local history state on `RouteSnapshot` as `state`,
  with `hasState` distinguishing an omitted state from an explicit `undefined`.
  Both are required members, so code that constructs a `RouteSnapshot` by hand
  (test fixtures, adapters) must supply them; code that only reads snapshots is
  unaffected.
- chore: refresh dependencies.

## 0.2.3 — 2026-08-25

- fix(data): make mutation invalidation and reconcile retries generation-safe
  when asynchronous submissions are superseded.
- fix(renderer): keep DOM-range ownership consistent when anchors are
  re-registered.
- fix(interactions): respect RTL arrow-key direction in roving focus.
- fix(runtime): harden scheduler, hydration, SSR, and error-boundary failure
  paths.

- feat(data): add lifecycle-owned dynamic keyed query collections with bounded
  initial loading, aggregate state, per-key retry, and shared query caching.
- fix(runtime): reject recursive `derive()` and `selector()` reads before a
  memoized value can bypass the self-evaluation guard.
- fix(runtime): route scheduled descendant and portal materialization failures
  to the nearest live `ErrorBoundary` while preserving unbounded propagation.

## 0.0.85

- breaking(runtime): require Node.js 24.15 or newer.
- feat(router): validate route hydration data and add synchronous `dehydrate`
  selectors so SSR/SSG can omit server-only fields while client navigation
  retains complete loader results.
- feat(router): add registry `basePath` support for mounted SPA, SSR, and SSG
  routing, destinations, navigation, redirects, activity, and metadata context.
- fix(jsx): expose safe element inspection and cloning from the structures
  foundation without carrying renderer-private cache metadata into clones.
- fix(renderer): retain intrinsic hosts and nested interactive descendants when
  a rerender passes through a transparent context scope, keep keyed provider
  ownership isolated, and preserve intentional focus moves during commits.
- fix(runtime): isolate synchronous DOM handlers from active reconciliation
  scopes and correctly detach capture-phase delegated listeners.

### 0.0.52 — audit remediation

- fix(release): rebuild packed artifacts from an absent `dist`, verify every
  export-map subpath and installed CLI, and keep source maps out of npm
  tarballs.
- fix(data): make query invalidation generation-safe, await reconciliation,
  normalize async failures, and retain mutation callbacks for an execution.
- fix(router): isolate initial route sources per root and keep history/route
  cleanup coherent when destination rendering or teardown fails.
- fix(renderer): make control, keyed, portal, ownership, and lifecycle writes
  transactional, with anchored multi-node ranges and structural SSR hydration.
- perf(hydration): adopt matching intrinsic SSR trees in place and publish only
  transactional refs and listeners instead of running full reconciliation.
- fix(hydration): activate deferred boundaries locally with retryable marker and
  listener rollback semantics, while preserving focus, portals, and cleanup.
- refactor(renderer): split blueprint, boundary-range, component-host, and
  lifecycle batch responsibilities behind internal facades with enforced
  complexity budgets.
- test(bench): add keyed movement-density and separate full-clear teardown
  diagnostics without changing movement thresholds or cleanup semantics.
- test(bench): add a Chromium component-boundary keyed reorder diagnostic and
  document browser authority for jsdom-only hotspot investigations.
- fix(router): preserve shared layout identity and roll back multi-root route
  DOM, ownership, metadata, history, and URL publication as one transaction.
- fix(ssg): publish full builds through staging/backup swap and incremental
  routes through temp-file replacement.
- test(quality): add replayable lifecycle traces, deterministic seed fixtures,
  timer-policy enforcement, benchmark guardrails, and package release gates.

## 0.0.51

- chore(quality): make release verification test packed consumers and public types, exclude source maps from npm tarballs, and replace architecture size checks with semantic boundaries.
- feat(router): add route-query updates for route-local filters without remounting the active route.
- feat(runtime): isolate render-scoped query caches, keep the first shared query contract, and evict entries when the last owner unmounts.
- feat(ssr): harden CSS style sanitization with an allowlist for safe functions and URI-scheme rejection, while resetting escape caches per request.
- fix(router): trim the public router barrel so internal manifest and SSR helpers stay on source-only paths.

## 0.0.29

- feat(state): support destructuring `const [get, set] = state(initial)`; getter remains callable and setter is identical to `get.set`. Added tests and docs.
