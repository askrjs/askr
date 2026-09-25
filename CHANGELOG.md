# Changelog

## Unreleased

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
