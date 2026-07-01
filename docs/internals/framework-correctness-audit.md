# Framework Correctness Audit

This report tracks the stable-release correctness audit for the Askr runtime.
The initial audit covers the client runtime, SPA router, SSR, and hydration.
SSG generation-specific behavior is deferred.

## Architecture risk assessment

| Area              | Primary risk                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reactive core     | Fine-grained effects collect reads through shared mutable state. Nested evaluation and self-invalidating effects require adversarial coverage.                |
| Scheduler         | Fast-lane reconciliation clears scheduler queues globally. The current depth guard counts all tasks in a flush, including valid fan-out.                      |
| State             | Strict cleanup errors can interrupt disposal before subscriptions and abort signals are finalized.                                                            |
| Resource          | Deferred starts can overlap. Native `Promise` checks do not recognize all promise-like values.                                                                |
| Rendering         | Retained DOM nodes are mutated before the enclosing commit succeeds. Rollback restores node references, not necessarily prior node state.                     |
| Control flow      | `For`, `Show`, and `Case` depend on child-scope disposal and scheduler preservation during reconciliation.                                                    |
| Router            | Route remount reuses the root instance and resets fields without disposing prior route-owned work. Router globals can outlive app cleanup.                    |
| SSR and hydration | SSR resolves route policy before render, while hydration currently selects a route match directly. Temporary SSR ownership and context isolation need probes. |

## Framework invariants

1. Disposed effects, child scopes, components, and route roots never execute again.
2. Dynamic dependency switching removes obsolete subscriptions before future writes.
3. Nested dependency collection cannot overwrite an outer collector.
4. A scheduler optimization never deletes unrelated queued work.
5. Cycle guards reject repeated cyclic work, not legitimate fan-out.
6. Writes during render fail without corrupting committed dependency graphs.
7. Cleanup runs once, and final disposal completes even when cleanup callbacks throw.
8. Component abort signals fire on unmount, route replacement, and app teardown.
9. A stale resource result never overwrites a newer generation.
10. Resource loading, success, and error transitions are deterministic.
11. Removing a `For`, `Show`, or `Case` branch disposes every descendant.
12. Keyed reorder preserves identity while removal disposes ownership.
13. Failed render commits leave DOM, listeners, and ownership metadata unchanged.
14. Route policy behavior is identical for startup, navigation, hydration, and SSR.
15. Redirect cycles fail deterministically.
16. Async mount-operation cleanup that resolves after disposal still runs exactly once.
17. Promise-like values receive the same semantics as native promises.
18. Concurrent SSR requests cannot share request-local state.

## Missing coverage at audit start

- Router cancellation coverage contains assertions that cannot fail, including
  `signalAborted || true`.
- One history integration case ends with `expect(true).toBe(true)`.
- A state subscription test manually cleans leaked state after unmount, masking
  framework cleanup failures.
- Fast-lane coverage does not reset its marker before reorder, so dropped work
  can pass unnoticed.
- Existing rollback tests mostly throw before mutation, not during retained-node
  reconciliation.
- Resource dependency tests flush between writes and do not queue multiple
  invalidations before one post-lane drain.
- Hydration coverage does not assert guarded-route deny or redirect behavior.

## Ranked suspected bugs

| Rank | Suspicion                                                              | Probability | Impact   |
| ---: | ---------------------------------------------------------------------- | ----------- | -------- |
|    1 | Route remount skips root-owned cleanup and abort                       | High        | Critical |
|    2 | Fast lane drops unrelated scheduler tasks                              | High        | Critical |
|    3 | Fast lane strands dirty reactive lanes after deleting their flush task | High        | Critical |
|    4 | Hydration bypasses route policies                                      | High        | Critical |
|    5 | Strict cleanup error prevents final disposal                           | High        | High     |
|    6 | Async `task()` cleanup resolving after unmount leaks                   | High        | High     |
|    7 | Scheduler rejects valid fan-out over 50 tasks                          | High        | High     |
|    8 | Mid-commit failure leaves partial DOM mutations                        | Medium-high | High     |
|    9 | `cleanupApp()` leaves router globals and active requests alive         | High        | High     |
|   10 | Redirect cycles are unbounded                                          | Medium-high | High     |
|   11 | Resource thenables are treated as synchronous values                   | High        | Medium   |
|   12 | Router policy thenables are treated as synchronous decisions           | Medium-high | High     |
|   13 | Async component thenables are mishandled in client or SSR rendering    | Medium-high | Medium   |
|   14 | Async router rejection has no deterministic handling path              | Medium-high | Medium   |
|   15 | Nested fine-grained effect evaluation corrupts dependency tracking     | Medium      | High     |
|   16 | Self-invalidating fine-grained effect loops outside scheduler guard    | Medium      | High     |
|   17 | Deferred resource starts duplicate the newest loader invocation        | Medium      | Medium   |
|   18 | SSR temporary component instances are not disposed after render        | Medium      | Medium   |
|   19 | SSR fallback context stack is unsafe under overlapping edge renders    | Medium      | High     |
|   20 | Delegated-event container bookkeeping can retain custom containers     | Medium-low  | Medium   |

## Adversarial test matrix

|   # | Scenario and expected behavior                                                                | Likely failure                             | Severity |
| --: | --------------------------------------------------------------------------------------------- | ------------------------------------------ | -------- |
|   1 | Navigate away from a route-root `resource()`; abort old work and ignore stale completion.     | Route remount skips disposal.              | Critical |
|   2 | Navigate away from route-root state; a stale setter cannot rerender the new route.            | Old readers survive reset.                 | Critical |
|   3 | Queue sibling state work beside a large keyed reorder; both commit.                           | Fast lane clears sibling task.             | Critical |
|   4 | Queue reactive work beside fast lane, then invalidate again; the lane remains schedulable.    | Dirty lane is stranded.                    | Critical |
|   5 | Throw from strict cleanup; subscriptions clear, signal aborts, and stale writes remain inert. | Early throw skips finalization.            | High     |
|   6 | Resolve async `task()` cleanup after unmount; cleanup runs once immediately.                  | Late cleanup is stored on a dead instance. | High     |
|   7 | Update more than 50 independent readers; all update successfully.                             | Guard counts fan-out as recursion.         | High     |
|   8 | Hydrate a denied guarded route; protected content never hydrates.                             | Hydration skips policy.                    | Critical |
|   9 | Hydrate a redirecting guarded route; URL and rendered route follow policy.                    | Hydration skips redirects.                 | Critical |
|  10 | Throw during retained-node update; prior DOM and listeners remain unchanged.                  | Rollback is shallow.                       | High     |
|  11 | Tear down app during async guard; stale completion cannot remount.                            | Router globals survive cleanup.            | High     |
|  12 | Redirect A to B and B to A; fail with a bounded error.                                        | Infinite loop or recursion.                | High     |
|  13 | Switch effect dependency branch; writes to the old source do nothing.                         | Subscription leak.                         | High     |
|  14 | Evaluate nested fine-grained effects; each retains its own sources.                           | Shared collector corruption.               | High     |
|  15 | Self-invalidating effect; report a bounded cycle failure.                                     | Unbounded effect loop.                     | High     |
|  16 | Dispose one effect while siblings are queued; disposed effect never runs.                     | Dirty set runs stale entry.                | High     |
|  17 | Write during cleanup; downstream work is deterministic without resurrection.                  | Ownership or ordering bug.                 | High     |
|  18 | Batch derived, component, reactive, and post work; lane order remains stable.                 | Lane ordering drift.                       | High     |
|  19 | Enqueue during active flush; new work drains once without starvation.                         | Re-entrancy loss.                          | High     |
|  20 | Schedule user microtasks around framework work; documented order holds.                       | Microtask coupling.                        | Medium   |
|  21 | Write state during render; fail without changing committed subscriptions.                     | Partial subscription commit.               | High     |
|  22 | Set stale state after ordinary unmount; no rerender occurs.                                   | Dangling reader.                           | High     |
|  23 | Switch `Show` branch containing resources and effects; dispose descendants.                   | Descendant leak.                           | High     |
|  24 | Remove a `For` item with nested descendants; cleanup runs once.                               | Scope leak.                                | High     |
|  25 | Reorder keyed `For` items; component state follows keys.                                      | Identity corruption.                       | High     |
|  26 | Combine nested `For` and `Show`; dispose only removed ownership.                              | Over-cleanup or leak.                      | High     |
|  27 | Resolve rapid resource refreshes out of order; newest value wins.                             | Stale overwrite.                           | Critical |
|  28 | Reject an older resource after newer success; preserve success.                               | Stale error overwrite.                     | High     |
|  29 | Change resource deps twice before post drain; start newest loader once.                       | Duplicate invocation.                      | Medium   |
|  30 | Unmount a pending resource; abort and ignore completion.                                      | Retained subscriber.                       | High     |
|  31 | Exercise pending, ready, refresh, and error resource transitions.                             | Missing loading edge.                      | Medium   |
|  32 | Return a resource thenable; await it like a native promise.                                   | Native-only promise test.                  | Medium   |
|  33 | Return a router auth or policy thenable; await the decision.                                  | Policy treated as value.                   | High     |
|  34 | Return a component thenable during client render.                                             | Incorrect sync render.                     | Medium   |
|  35 | Return a component thenable during SSR.                                                       | Incorrect SSR behavior.                    | Medium   |
|  36 | Reject async `task()`; handle it without an unhandled rejection.                              | Missing rejection handler.                 | Medium   |
|  37 | Reject async route policy; do not apply stale work or leak rejection.                         | Missing rejection handler.                 | Medium   |
|  38 | Update fragment primitives across positions; preserve correct text nodes.                     | Positional bug.                            | Medium   |
|  39 | Reorder, append, and remove keyed children together; preserve exact order.                    | Fast-path corruption.                      | High     |
|  40 | Replace nested component host; clean lifecycle and listeners once.                            | Duplicate or omitted teardown.             | High     |
|  41 | Preserve same-path query navigation behavior after lifecycle fixes.                           | Over-eager remount.                        | Medium   |
|  42 | Race guarded navigations; only the newest request wins.                                       | Stale route data.                          | Critical |
|  43 | Use back or forward during pending guard; align history and render.                           | Popstate race.                             | High     |
|  44 | Match SSR deny and redirect behavior with client startup.                                     | Resolution divergence.                     | High     |
|  45 | SSR with preloaded resource data stays synchronous and deterministic.                         | Keying drift.                              | High     |
|  46 | Dispose temporary SSR ownership after render.                                                 | SSR ownership leak.                        | Medium   |
|  47 | Overlap SSR requests; isolate render data and keys.                                           | Request state bleed.                       | Critical |
|  48 | Force fallback SSR context mode; isolate overlaps or fail explicitly.                         | Stack interleaving.                        | High     |
|  49 | Remove delegated handlers under a custom container; release bookkeeping.                      | Container retention.                       | Medium   |
|  50 | Repeat mount, navigation, branch switching, and unmount cycles.                               | Compound leak.                             | High     |

## Execution ledger

Baseline on 2026-05-30:

- `npm run test:jsdom`: passed, 165 files and 766 tests.
- Git worktree: clean before audit edits.

Confirmed bugs and validation results are appended below as the TDD batches run.

### First-wave red tests

Targeted command:

```bash
npx vp test run -c vitest.test.jsdom.config.ts tests/jsdom/router/lifecycle-invariants.test.tsx tests/jsdom/app/cleanup-invariants.test.tsx tests/jsdom/runtime/scheduler-invariants.test.tsx tests/jsdom/ssr/hydration-policy-invariants.test.tsx tests/jsdom/dom/no-partial-dom.test.tsx
```

Result before runtime fixes: 9 failed and 4 passed.

| Matrix item | Status         | Root cause                                                                                                                 |
| ----------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1           | Confirmed      | Route remount nulls the root abort controller without disposing the old resource cell.                                     |
| 2           | Confirmed      | Route remount resets hook storage without cleaning route-root cleanup functions or committed readable subscriptions.       |
| 3           | Confirmed      | `enterBulkCommit()` clears all scheduler lanes globally.                                                                   |
| 4           | Confirmed      | Clearing a fine-grained lane task leaves its pending-lane marker set, so later invalidations do not enqueue another flush. |
| 5           | Confirmed      | Strict cleanup throws before abort, subscription cleanup, stale-update invalidation, and mounted-state finalization.       |
| 6           | Confirmed      | Async mount-operation settlement appends cleanup to an already disposed instance.                                          |
| 7           | Confirmed      | Scheduler depth accounting increments for every task, rejecting valid fan-out after task 50.                               |
| 8           | Confirmed      | `hydrateSPA()` uses direct route matching and does not apply deny policy before render.                                    |
| 9           | Confirmed      | `hydrateSPA()` uses direct route matching and does not follow policy redirects before render.                              |
| 10          | Not reproduced | The retained-text rollback probe passes. Keep the broader transactional concern open for later renderer probes.            |

### First-wave fixes

The same targeted command now passes: 5 files and 13 tests.

| Confirmed items | Minimal fix                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1, 2            | Route remount calls component cleanup before resetting root hook storage. This disposes route resources, aborts route-owned work, removes readable subscriptions, and runs route cleanup before the next mount.    |
| 3, 4            | Fast-lane entry and exit no longer clear global scheduler queues. Unrelated component and reactive-lane tasks remain queued for the scheduler to drain.                                                            |
| 5               | Component cleanup records strict errors and throws only after child scopes, cleanup callbacks, subscriptions, abort state, update callbacks, and mounted state are finalized.                                      |
| 6               | Async mount-operation settlement captures the lifecycle generation. A cleanup that resolves after disposal runs immediately instead of being stored on an inert instance. Rejections are logged deterministically. |
| 7               | The scheduler depth guard tracks repeated execution of the same task during an epoch instead of counting independent tasks.                                                                                        |
| 8, 9            | SPA boot and hydration share bounded initial route resolution. Hydration applies deny and redirect policy before mounting content.                                                                                 |

### First-wave surrounding-suite follow-up

The router, app, runtime, SSR, and fast-lane suites exposed two follow-ups:

- `runWithSyncProgress()` still rejected preserved sibling tasks when called
  from inside an outer scheduler flush. Its quiescence assertion now applies
  only when no outer flush is active.
- A same-route router test did not await `createSPA()`. It had passed because a
  stale router-global app instance leaked across tests. The router cleanup fix
  exposed the hidden dependency; the test now awaits startup.

### Second-wave red tests

Targeted command:

```bash
npx vp test run -c vitest.test.jsdom.config.ts tests/jsdom/runtime/effect-invariants.test.ts tests/jsdom/operations/promise-like-invariants.test.ts tests/jsdom/router/async-invariants.test.tsx tests/jsdom/ssr/promise-like-invariants.test.tsx tests/jsdom/app/cleanup-invariants.test.tsx
```

Result before second-wave fixes: 7 failed and 5 passed.

| Matrix item | Status              | Root cause                                                                                                                             |
| ----------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 11          | Covered             | App cleanup now aborts the active route request and unregisters the routed root.                                                       |
| 12          | Partially confirmed | Initial boot redirect cycles are bounded after the shared startup fix. Client navigation redirects still recurse until stack overflow. |
| 14          | Confirmed           | Nested fine-grained evaluation clears the single global source buffer and removes outer dependencies.                                  |
| 15          | Confirmed           | A self-invalidating fine-grained effect can rerun repeatedly inside one lane flush without a bound.                                    |
| 32          | Confirmed           | `ResourceCell` recognizes only native `Promise` instances.                                                                             |
| 33          | Confirmed           | Thenable policy results skip continuation to later policies.                                                                           |
| 34          | Confirmed           | Client rendering accepts thenable component results as synchronous output.                                                             |
| 35          | Confirmed           | Sync SSR accepts thenable component results instead of reporting async SSR data.                                                       |
| 36          | Covered             | Rejected async `task()` work is logged through the deterministic mount-operation rejection handler.                                    |

### Second-wave fixes

The second-wave targeted command now passes: 5 files and 12 tests.

| Confirmed items | Minimal fix                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12              | Client navigation carries a redirect-chain visited set and bounded redirect count across recursive resolution.                                                                 |
| 14              | Fine-grained effect evaluation allocates a source buffer per evaluation, preserving outer collection during nested work.                                                       |
| 15              | A lane flush limits each fine-grained effect to 50 executions and reports a reactive-cycle error.                                                                              |
| 32, 33, 34, 35  | Added one internal `isPromiseLike()` predicate. Resources, router policy flow, root wrappers, renderer component paths, and synchronous SSR now handle thenables consistently. |

### Event and rejection follow-up

| Matrix item | Status              | Root cause and fix                                                                                                                                                                                                                          |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 37          | Covered             | Async navigation and popstate policy rejection handlers log deterministic errors and prevent unhandled promise rejections.                                                                                                                  |
| 49          | Confirmed and fixed | Delegated handlers were removed from elements, but the strong container-level listener map retained listeners after the final handler disappeared. Usage is now counted per container and event; the container listener is removed at zero. |

### Third-wave red tests

Targeted command:

```bash
npx vp test run -c vitest.test.jsdom.config.ts tests/jsdom/operations/resource-coverage.test.tsx tests/jsdom/ssr/ownership-invariants.test.tsx
```

Result before third-wave fixes: 2 failed and 3 passed.

| Matrix item | Status    | Root cause                                                                                                                                                          |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 29          | Confirmed | Every dependency change enqueues a post-lane starter. Older queued starters invoke the newest loader because they do not check the generation captured when queued. |
| 46          | Confirmed | SSR creates temporary component owners but discards them without lifecycle disposal. A signal captured during SSR remains live after the request ends.              |

### Third-wave fixes

The SSR and operations suites now pass: 28 files and 129 tests.

| Confirmed items | Minimal fix                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 29              | Deferred resource starters capture their scheduled generation and become inert if a newer generation exists before the post lane drains.                                                                                         |
| 46              | SSR render contexts collect temporary-owner cleanup callbacks and drain them in reverse order at request exit. Disposal happens after the full tree renders so sibling SSR components still share the request-local query cache. |

The SSR query-cache isolation regression now asserts both sides of that lifetime:
entries exist while sibling components render and are removed when temporary
owners are disposed at request exit.

### Hydration verifier and async-router follow-up

Targeted command:

```bash
npx vp test run -c vitest.test.jsdom.config.ts tests/jsdom/ssr/hydration.test.tsx tests/jsdom/ssr/hydration-policy-invariants.test.tsx tests/jsdom/router/async-invariants.test.tsx tests/jsdom/router/history-integration.test.tsx
```

Result after follow-up fixes: 4 files and 47 tests passed.

| Matrix item | Status          | Root cause and fix                                                                                                                                                                                                                   |
| ----------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 8, 9        | Follow-up fixed | `hydrateSPA()` now passes the already resolved hydration target into markup verification instead of re-resolving routes policy-blind. Deny and redirect hydration cases can run with `verifyMarkup: true` against matching SSR HTML. |
| 12, 37      | Follow-up fixed | Async navigation and async popstate success handlers now catch synchronous exceptions thrown while applying a resolved route and log them deterministically, including redirect-cycle and remount-cleanup failures.                  |

### Matrix coverage crosswalk

The audit added direct regressions for items 1-9, 11-41, 44-47, and 49. The
retained-node probe for item 10 passed without a
runtime change. The complete suite also reruns the existing focused coverage
families:

| Matrix items   | Existing regression families rerun                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 13, 16-22      | Runtime scheduler, queued cleanup, evaluation transaction, microtask, state mutation, and subscription suites.           |
| 23-26, 38-40   | `Show`/`Case`, keyed identity, nested `For`, listener lifecycle, text update, rollback, and transactional commit suites. |
| 27, 28, 30, 31 | Resource staleness, dependency ordering, edge-case, unmount-inert, and transition coverage suites.                       |
| 41-45          | Router identity, navigation cancellation, history, guarded navigation, SSR request resolution, and hydration suites.     |
| 47, 50         | SSR concurrency, repeated mount/unmount stress, and routed-shell retention benchmark suites.                             |

Final matrix follow-up:

- Item 13 now has a direct fine-grained effect probe. After an effect switches
  from one dependency branch to another, writes to the old source no longer run
  the effect while writes to the active source still commit.
- Item 16 now has a direct queued-effect disposal probe. When one invalidated
  effect is cleaned up before the lane flush, that effect is skipped and sibling
  queued work still commits.
- Item 17 now has a direct cleanup-write ownership probe. A cleanup callback can
  write shared state for live descendants without rerendering or retaining the
  disposed child that originally read that state.
- Item 18 now has a direct scheduler lane-order probe. A mixed batch of derived,
  component, reactive, and post work drains in stable lane order while
  preserving FIFO order inside each lane.
- Item 19 now has a direct active-flush enqueue probe. Work scheduled by a task
  already being flushed drains in the same epoch after existing sibling work and
  leaves no pending queue entries behind.
- Item 20 now has a direct scheduler probe. A user microtask queued before a
  framework flush runs first, and a user microtask queued after the framework
  flush runs afterward.
- Item 21 now has a direct render-transaction probe. A render that reads a new
  source and then throws on `state.set()` leaves the prior committed
  subscriptions active and does not subscribe the speculative source.
- Item 22 now has a direct stale-setter probe. A child-owned state setter
  captured before unmount can be called later without rerendering or remounting
  the disposed child.
- Item 23 now has a direct `Show` descendant-disposal probe. Removing a truthy
  branch aborts a nested resource, cleans a nested fine-grained effect, and
  leaves stale descendant writes inert.
- Item 24 now has a direct keyed `For` removal probe. Removing one keyed row
  cleans that row's nested descendant exactly once while retained rows remain
  live and the removed descendant's stale setter is inert.
- Item 25 now has a direct keyed `For` reorder probe. Row-local state and DOM
  identity follow their stable keys through a move-only reorder.
- Item 26 now has a direct nested `For` + `Show` ownership probe. Removing one
  keyed row disposes that row and its shown descendants while hiding a retained
  row's `Show` branch disposes only that branch.
- Item 27 now has a direct stale-success resource probe. When a newer refresh
  succeeds first, a late success from the older generation cannot overwrite the
  committed value.
- Item 28 now has a direct stale-rejection resource probe. When a newer refresh
  succeeds first, a late rejection from the older generation neither overwrites
  the value nor logs an async resource error.
- Item 30 now has a direct pending-resource unmount probe. Unmount aborts the
  in-flight resource and a late completion leaves the disposed snapshot
  unchanged.
- Item 31 now has a direct resource transition probe covering pending, ready,
  refresh-pending with the prior value retained, and refresh error.
- Item 38 now has a direct fragment primitive-position probe. Fragment-wrapped
  primitive siblings update in place around an element anchor without merging or
  shifting text nodes.
- Item 39 now has a direct keyed children probe combining reorder, append, and
  removal in one update while preserving retained keyed nodes.
- Item 40 now has a direct nested host replacement probe. Replacing a nested
  component's root host detaches the old host ref once and removes its direct
  listener while the new host listener remains active.
- Item 41 now has a direct same-path navigation probe. Updating query and hash
  for the current pathname preserves route DOM identity and local state while
  refreshing the route snapshot.
- Item 43 already has a direct history regression: a slow guarded popstate is
  aborted when a newer fast popstate wins, and the rendered route remains
  aligned with the URL.

Resolved follow-up probes:

- Item 10: retained-node rollback now has focused failures after capture
  listener replacement/addition, form-control property writes, and child
  reorder/removal/insertion. Failed retained updates restore the existing
  element in place, including attributes, children, text data, form-control
  state, refs, reactive props, and direct/delegated listener handler metadata.
- Item 44: URL-based SSR rendering through a registry now applies synchronous
  deny and redirect route policy before rendering. Denied routes render the same
  marker as startup and hydration without invoking protected handlers, and
  redirects render the final target route.
- Item 45: URL-based registry SSR now has direct preloaded resource data probes.
  Route resources read deterministic `r:*` keys, serialize the supplied render
  data for hydration, and throw `SSRDataMissingError` before invoking loaders
  when a required key is absent.
- Item 47: URL-based registry SSR now has a direct concurrent render probe that
  shares one registry across two route renders while isolating route snapshots,
  preloaded resource keys, serialized render data, and loader suppression.
- Item 48: the forced non-`AsyncLocalStorage` SSR fallback path now has
  dedicated invariants. Nested synchronous fallback contexts restore in stack
  order, and promise-like fallback callbacks throw a deterministic unsupported
  async fallback error before context can leak.

### Validation

Required release gates:

| Command              | Result                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`       | Passed.                                                                                                                  |
| `npm run build`      | Passed, 362 packed files.                                                                                                |
| `npm test`           | Passed: 10 unit files / 94 tests, 2 check files / 3 tests, 174 jsdom files / 792 tests, and 11 browser files / 38 tests. |
| `npm run test:types` | Passed.                                                                                                                  |
| `git diff --check`   | Passed.                                                                                                                  |

Benchmark smoke gates:

| Command               | Result                                                                            |
| --------------------- | --------------------------------------------------------------------------------- |
| `npm run bench:tier1` | Passed.                                                                           |
| `npm run bench:tier2` | Passed, including resource abort and SSR concurrency workloads.                   |
| `npm run bench:tier3` | Passed in Chromium.                                                               |
| `npm run bench:tier4` | Passed in Chromium, including routed-shell retention and hydrated-table teardown. |

Benchmark runs are smoke validation only. The final Tier 1 and Tier 2 samples
were noisy, so this audit does not claim a performance comparison.

The last full `npm test` run emitted transient Vitest fork-shutdown timeout
warnings after all jsdom assertions completed. A focused SSR/resource rerun
exited cleanly, and no Node processes remained afterward. Treat this as an
environmental warning unless it reproduces in isolation.

`npm run test:types` also surfaced one latent `For` declaration issue:
`syncForIndexSignal()` returned an optional readable marker as
`boolean | undefined`. The return is now normalized with `=== true`; runtime
behavior is unchanged.

## 2026-06 regression gate matrix

This follow-up keeps the audit actionable as the package surface changes. Any
new regression should be mapped to one row before it is fixed, and the final
fix should leave a focused test in the listed gate.

| Risk class                               | Required durable coverage                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| State, scheduler, and reactive ownership | `tests/jsdom/runtime`, `tests/jsdom/state`, or `tests/jsdom/operations`, with no placeholder assertions or timing sleeps unless fake timers drive the clock. |
| Renderer reconciliation and DOM rollback | `tests/jsdom/dom` or `tests/jsdom/identity`, plus a public browser workflow only when the failure depends on real focus, event, or layout behavior.          |
| Router, resources, and history races     | Tight jsdom tests in `tests/jsdom/router` or `tests/jsdom/app-flows`; real-browser coverage for popstate, focus, and hydration interactions.                 |
| SSR, SSG, and hydration policy           | `tests/jsdom/ssr`, `tests/jsdom/ssg`, and browser hydration smoke tests when client event attachment is involved.                                            |
| Public package surface and type drift    | `tests/checks`, `tests/types`, export-map tests, and package import smoke tests.                                                                             |
| Performance-sensitive correctness        | A correctness test first, then an existing tiered benchmark only if the behavior has a known hot path.                                                       |

Release validation for this matrix is the local gate:

```bash
npm run lint
npm run build
npm run test:checks
npm run test:unit
npm run test:jsdom
npm run test:browser
```
