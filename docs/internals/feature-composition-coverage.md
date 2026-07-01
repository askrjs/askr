# Feature Composition Coverage

This matrix tracks app-shaped correctness coverage for interactions between
framework systems. Isolated primitive tests remain useful, but they do not prove
that ownership, scheduling, and DOM behavior remain correct when features are
composed into workflows users actually build.

## Coverage structure

| Path                               | Purpose                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `tests/jsdom/app-flows/`           | Deterministic mini-app workflows with DOM, lifecycle, and async probes. |
| `tests/browser/app-flows/`         | Browser-only focus, history, hydration, and event-loop workflows.       |
| `tests/jsdom/regressions/app-core` | Tight regressions extracted from confirmed composed-flow bugs.          |

## Existing inventory

The browser fixture already contains realistic search-resource, routed-shell,
editable order-table, form, and hydration-form scenarios. The jsdom suite has
strong subsystem tests for resources, router lifecycle, `For`, `Show`, portals,
context, cleanup, and hydration.

The missing layer is deterministic composition coverage: small applications
that combine these primitives and deliberately race user workflows against
cleanup. Before this audit, `tests/jsdom/app-flows/` did not exist.

## Priority matrix

|   # | User workflow                                                                                              | Systems involved                                                   | Protected invariant                                                      | Likely failure mode                                                                       | Why subsystem tests are insufficient                                                            | Status              |
| --: | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------- |
|   1 | Load routed data through a `Show` loading branch, then navigate away before resolution.                    | router, `resource()`, `Show`, cleanup                              | A stale resource cannot update an unmounted route branch.                | The disposed resource publishes into a retired branch or rerenders the replacement route. | Resource unmount tests do not pass through router remount plus branch ownership.                | Covered             |
|   2 | Load a keyed team table from a route param, navigate to another team, then resolve responses out of order. | router, route params, `resource()`, `For`, cleanup                 | Old table rows never appear under the new route param.                   | The first generation commits stale rows or a keyed boundary reuses old ownership.         | Router param and resource race tests do not compose with keyed reconciliation.                  | Covered             |
|   3 | Edit row-local drafts, sort, filter, remove, and restore rows in an admin table.                           | `state()`, `derive()`, `For`, forms/events, cleanup                | Retained keys preserve draft identity; removed keys dispose local state. | Reorder remounts rows, or removal leaves stale row setters and signals alive.             | Keyed identity tests do not exercise derived filtering and controlled row inputs together.      | Covered             |
|   4 | Open a fulfillment modal from a routed order page and navigate away while it is open.                      | router, `state()`, `For`, portal, events, cleanup                  | Overlay DOM, listeners, and reactive ownership leave with the route.     | The singleton portal retains the last VNode after its writer disappears.                  | Portal tests previously closed overlays explicitly; router tests did not leave an overlay open. | Confirmed and fixed |
|   5 | Edit a controlled form, render a derived preview, submit asynchronously, then navigate away.               | router, `state()`, `derive()`, `resource()`, forms/events, cleanup | Pending submit completion cannot mutate an unmounted form.               | Late submit settlement resurrects form UI or stale setters rerender the next route.       | Form, derive, and resource tests do not share one routed lifecycle.                             | Confirmed and fixed |
|   6 | Provide layout context, load nested-route data, and navigate between sibling outlets.                      | layout, `Outlet`, context, router, `resource()`                    | Layout identity survives while page resources remain isolated.           | Layout remount loses context or sibling resources share stale ownership.                  | Layout tests preserve DOM identity without context-backed resources.                            | Confirmed and fixed |
|   7 | Hydrate server markup and immediately trigger a resource-backed search event.                              | hydration, events, `state()`, `resource()`                         | Hydration attaches one handler and starts one fetch per interaction.     | Listener duplication dispatches duplicate updates or requests.                            | Hydration listener tests do not trigger async data work immediately after hydration.            | Covered             |
|   8 | Recover from a resource failure through an error branch and render keyed results.                          | `resource()`, `Show`, `For`, events                                | Error ownership is retired before the successful keyed branch mounts.    | Retry leaves error subscriptions active or duplicates list ownership.                     | Resource transition tests and branch tests are isolated.                                        | Covered             |
|   9 | Navigate A to B to A with B still loading, including browser history restoration.                          | router, history, `resource()`, cleanup                             | Only the current history entry can commit resource UI.                   | A stale B completion paints after back navigation.                                        | Router popstate races currently focus on policy resolution, not page resources.                 | Confirmed and fixed |
|  10 | Open a row menu in a portal and remove its keyed row while the menu is open.                               | `For`, portal, events, cleanup                                     | Removing a row disposes its overlay and handler ownership.               | The portal outlives the disposed keyed row or an old button remains active.               | Portal cleanup and keyed removal tests do not share ownership.                                  | Covered             |

## Missing scenarios

The first two batches close matrix items 1 through 10. The next expansion
should prioritize real-browser versions of immediate hydrated search and
back/forward resource races, then add mixed `For` boundary siblings and nested
layout teardown cycles to broaden the composed lifecycle surface.

## Shared fixtures

`tests/jsdom/app-flows/helpers.ts` owns controlled deferred promises and a
microtask settlement helper. App-flow tests use explicit resolution and
rejection rather than sleeps.

## Execution ledger

### Routed portal ownership

The first composed test, `routed-order-modal.test.tsx`, failed before the fix:
navigation preserved the shared shell and disposed the old route, but the
fulfillment dialog remained in the default portal host.

Root causes:

- declarative portal writes did not register writer ownership;
- subtree teardown skipped null-component instances stored on comment hosts;
- route replacement reused the root host before clearing prior portal content.

The minimal fix registers declarative portal ownership, releases only the
active owner's slot on cleanup, tears down comment-host instances, and clears
the default slot at route replacement. The tight regression lives in
`tests/jsdom/regressions/app-core/portal-owner-cleanup.test.tsx`.

### Dynamic derived dependencies and warnings

`filtered-admin-table.test.tsx` initially failed after filtering the admin table
to one row. The sort comparator stopped reading its sort-direction state because
there was nothing to compare, and Askr incorrectly emitted an unused-state
warning.

The warning heuristic reset current-render reads and checked only current
subscriptions. Dynamic derived graphs can validly drop a source temporarily.
Readable sources now record whether they have ever been consumed, and the
warning is limited to state that has never been read. The tight regression lives
in `tests/jsdom/regressions/app-core/dynamic-derived-unused-warning.test.tsx`.

### Mixed control-boundary siblings

`routed-form-submit.test.tsx` initially failed before submission: the account
form mounted, then its resource's synchronous idle settlement rerendered the
form and removed the label, input, and submit button. Only the `Show` fallback
paragraph remained.

`updateUnkeyedChildren()` treated a control boundary found among siblings as
though it owned the entire parent. It called the direct-boundary update path,
which replaced every sibling. Mixed `Show` and `Case` boundaries now sync only
their active branch node at the current position. Direct control boundaries
keep their specialized commit path. The tight regression lives in
`tests/jsdom/regressions/app-core/mixed-show-siblings.test.tsx`.

Package type validation also rejected `Node.remove()` in the new helper because
the supported DOM typing only guarantees parent-owned removal. The helper now
uses `parent.removeChild(node)` after its existing ownership check.

### Routed layout context and retained outlet chains

`layout-context-resource.test.tsx` initially rendered the correct tenant value
in a shared layout header but captured the context default in nested route
resources. Route registration eagerly executed matched leaf components before
their layout provider rendered. Deferring matched leaves and `page()` shells as
component VNodes fixed plain routed context, but sibling outlet navigation then
exposed a second issue: retained component-chain updates resolved replacement
leaves through temporary instances and immediately disposed them.

Matched leaves and page shells now execute through renderer-owned VNodes, and
collapsed host-chain updates reuse or mount durable nested instances while
disposing chain members that no longer participate. The tight routed-context
regression lives in
`tests/jsdom/regressions/app-core/routed-layout-context.test.tsx`.

### Nested routed ownership cleanup

`history-resource-race.test.tsx` exposed a lifecycle gap after routed leaves
became renderer-owned: route replacement finalized the reusable root instance
but skipped nested instances retained under shared layout DOM. Pending page
resources therefore stayed live after navigation.

Route remount now finalizes component stacks below each retained root child
before resetting the reusable root. Matched leaf VNodes carry an internal
route-root marker so historical `task()` mount-operation behavior remains
intact, and renderer-owned children inherit strict cleanup mode. The tight
regression lives in
`tests/jsdom/regressions/app-core/routed-nested-resource-cleanup.test.tsx`.

### Route handler compatibility and browser lifecycle contract

The first deferred-leaf implementation changed `RouteRecord.handler` itself,
so direct `resolved.handler(params)` calls returned an internal component VNode
instead of the established eager output. The manifest unit suite caught ten
compatibility regressions. Route records now retain their eager public handler
and carry a separate internal renderer handler for request-driven SPA and
manifest rendering.

The full browser suite also surfaced an older routed-shell expectation that a
settings form draft survived navigation away and back. That persistence relied
on leaked route-local ownership. The browser workflow now verifies the intended
boundary: the shared shell DOM node survives reconciliation while the routed
form remounts with fresh local state.

## First-batch implementation

| Matrix item | App-flow test                                          |
| ----------- | ------------------------------------------------------ |
| 1           | `tests/jsdom/app-flows/routed-resource-show.test.tsx`  |
| 2           | `tests/jsdom/app-flows/routed-resource-table.test.tsx` |
| 3           | `tests/jsdom/app-flows/filtered-admin-table.test.tsx`  |
| 4           | `tests/jsdom/app-flows/routed-order-modal.test.tsx`    |
| 5           | `tests/jsdom/app-flows/routed-form-submit.test.tsx`    |

## Second-batch implementation

| Matrix item | App-flow test                                                 |
| ----------- | ------------------------------------------------------------- |
| 6           | `tests/jsdom/app-flows/layout-context-resource.test.tsx`      |
| 7           | `tests/jsdom/app-flows/hydrated-resource-search.test.tsx`     |
| 8           | `tests/jsdom/app-flows/resource-error-recovery-list.test.tsx` |
| 9           | `tests/jsdom/app-flows/history-resource-race.test.tsx`        |
| 10          | `tests/jsdom/app-flows/portal-row-removal.test.tsx`           |

## Validation

| Command               | Result                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| `npm run lint`        | Passed.                                                                 |
| `npm run build`       | Passed.                                                                 |
| `npm test`            | Passed end to end: 104 unit, 4 checks, 832 jsdom, and 38 browser tests. |
| `npm run test:types`  | Passed after the parent-owned DOM removal typing correction.            |
| `npm run bench:tier1` | Passed.                                                                 |
| `npm run bench:tier2` | Passed.                                                                 |
| `npm run bench:tier3` | Passed.                                                                 |
| `npm run bench:tier4` | Passed.                                                                 |

After the parent-owned removal typing correction, one aggregate `npm test`
rerun timed out in the existing `should append rows with JSX` benchmark
scenario. The scenario passed alone with all 7 tests, and fresh final-code
reruns passed all 104 unit, 4 checks, 825 jsdom, and 38 browser tests.

The second batch added seven jsdom regressions and app flows. Final-code
validation passed `npm run lint`, `npm run build`, `npm run test:types`, and
the aggregate `npm test` run with 104 unit, 4 checks, 832 jsdom, and 38 browser
tests. Tier 1, Tier 2, Tier 3, and Tier 4 benchmarks passed.

## Cross-package regression follow-up

`askr-ui` and `askr-themes` should feed failures back into this matrix whenever
the root cause is runtime timing, ownership, event freshness, portal cleanup, or
hydration behavior. Package-local tests should still own their public contracts,
but runtime-sensitive fixes should leave an `askr` regression if the framework
itself can reproduce the bug without the higher-level package.

| Cross-package symptom                                          | First package-local test                 | Add an `askr` regression when                                                           |
| -------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Stale component handler reads old context or state             | `askr-ui` browser behavior test          | A minimal component using `state()`, context, or event handlers reproduces stale reads. |
| Ref callback causes render-time state mutation                 | `askr-ui` browser behavior or jsdom test | The failure comes from renderer ref timing rather than component-specific logic.        |
| Theme shell leaks overlay, focus, scroll lock, or route state  | `askr-themes` browser smoke              | The leak is caused by portal ownership, route cleanup, or delegated event cleanup.      |
| Themed or headless package import breaks after dependency bump | Package export/type test                 | The dependency exposes an incompatible public entrypoint or type contract.              |
