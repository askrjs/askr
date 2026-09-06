# Development: Quality Contracts

Runtime changes are governed by observable invariants, not module size or
function names. A change must name the contract it affects and extend the
durable test family that observes it.

## Dependency and ownership map

- `compatibility` owns published declarations and extension adapters. See the
  [public compatibility boundary](./compatibility-boundary.md) for contract
  maintenance, native renderer wiring, and packed consumer validation.
- `runtime` is platform-neutral. It does not depend on renderer, boot, SSR, or
  SSG implementations. External subsystems use `runtime/index.ts`, while
  default scheduler and runtime access stays behind `runtime/access.ts`.
- `renderer` owns browser DOM mutation. Reconciliation enters through
  `reconciliation/reconcile-commit.ts`, which either commits the target node sequence or
  restores a coherent replacement on failure.
- `ownership/record.ts` owns the lifetime graph and its iterative disposal drain.
  `component/cleanup.ts` supplies execution invalidation, subscription removal,
  and strict/non-strict error settlement to that drain.
- `ssr` and `ssg` do not depend on browser renderer internals. Synchronous SSR
  remains the documented rendering boundary.

## Test families

- `tests/checks/architecture.test.ts` protects dependency direction,
  singleton access, server/browser separation, lifecycle ownership, and the
  reconciliation commit boundary. Its dependency matrix follows value imports,
  type-only imports, re-exports, and literal dynamic imports.
  Every implementation-level value-import cycle touching runtime or renderer
  fails the check. Recursive rendering uses explicit host composition and leaf
  contracts. Type-only dependencies remain distinguishable from executable
  dependencies. Module length and source-string matching are not architecture
  contracts.
- `tests/checks/public-api-snapshot.test.ts` compares the emitted declaration
  exports for every package subpath with `public-api.snapshot.json` and follows
  their normalized declarations into `public-declarations.snapshot.json`.
  Reachable callback types are consumer contracts even when their names are not
  exported directly. Private class implementation and generated bundle aliases
  are excluded. Update a snapshot only for an approved public API change and
  review the declaration diff, including reachable types.
- `tests/types/` contains consumer examples for arguments, inferred returns,
  overloads, callbacks, and rejected usage. `npm run test:installed` runs these
  same fixtures and `tests/consumer-contracts/` against a packed artifact in an
  isolated install, without source aliases. Both run on PRs. Keep these fixtures
  stable during internal refactors; an internal representation change is not a
  reason to weaken a consumer assertion.
  To check a reference release with the same fixtures, pass its local tarball:
  `npm run test:installed -- /path/to/askrjs-askr-0.2.4.tgz`.
- `tests/jsdom/runtime/lifecycle-sequences.test.tsx` replays deterministic
  mount/update/flush/dispose sequences. PR coverage uses seeds `1`, `7`, `42`,
  and `0xc0ffee`; extended PR and scheduled quality coverage use `0..99`. Add a regression
  seed to `ASKR_QUALITY_SEEDS` when fixing a sequence failure. The trace covers
  controls, keyed ranges, navigation cancellation/popstate, resources, portals,
  cleanup errors, renderer rollback, and scheduler recovery. A failure writes
  the seed, environment, operation prefix, expected model, observed state, and
  replay data to the ignored `.askr-quality-traces/` directory; durable
  seed/operation fixtures belong under `tests/quality-fixtures/`.
- jsdom and browser flow suites cover hydration, navigation/resource races,
  mixed control boundaries, portals, and nested layout teardown. Use deferred
  promises or fake timers for scheduler/router/resource tests; real time is
  reserved for explicitly marked browser integration behavior that requires it.
  The repository guideline scans every test file for unmarked real timers.
  The interaction regression explicitly focuses the settings control before
  sending `Tab`: WebKit's test driver can leave focus on the search input after
  `locator.click()` even though raw WebKit preserves the static fixture's
  focus behavior. This is a test-driver compatibility guard, not a runtime
  focus change.
- Extended PR coverage runs Chromium, Firefox, and WebKit. The bulk-commit
  replay test dispatches a deterministic synchronous event during DOM
  application in every engine. Separate native-event coverage expects removal
  to emit `blur` in Chromium and no `blur` in Firefox or WebKit, while requiring
  retained input identity and completed reordering in all three engines.
- SSG tests cover route planning, parameter expansion, incremental cleanup,
  and failed generation behavior.
- Owner tests cover deep disposal, reparenting, failure drainage, and exact
  generation identity. Transaction tests cover nested publication, reversible
  subscriptions and host application, reentrant writes, and post-publication
  settlement failures. Optimized rendering uses these same observable contracts.

## Feature composition coverage

App-shaped regressions belong in `tests/jsdom/app-flows/` when deterministic
DOM, lifecycle, and async probes can observe the contract. Browser-only focus,
history, hydration, and event-loop behavior belongs in
`tests/browser/app-flows/`. A confirmed framework bug should also leave the
smallest durable regression under `tests/jsdom/regressions/app-core/`.

Standing composition coverage protects these workflows:

| Workflow                                             | Protected invariant                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Routed resource plus `Show` during navigation        | A stale resource cannot update an unmounted route branch.              |
| Param-driven keyed table with out-of-order responses | Old keyed rows cannot commit under a new route parameter.              |
| Editable sorted and filtered rows                    | Retained keys preserve local identity and removed keys dispose it.     |
| Routed portal left open during navigation            | Overlay DOM, listeners, and reactive ownership leave with the route.   |
| Async form submission during navigation              | Late settlement cannot mutate an unmounted form.                       |
| Shared layout context across sibling outlets         | Layout identity survives while page resources remain isolated.         |
| Immediate resource interaction after hydration       | Hydration attaches one handler and starts one request per interaction. |
| Error recovery into keyed results                    | Error ownership retires before the successful branch mounts.           |
| Back/forward navigation with a pending route         | Only the current history entry may commit resource UI.                 |
| Portal owned by a removed keyed row                  | Removing the row also disposes its overlay and handlers.               |

Use controlled deferred promises and explicit microtask settlement rather than
sleeps. Higher-level `askr-ui` and `askr-themes` failures should add an Askr
regression when a minimal runtime case reproduces stale handlers, render-time
ref mutation, portal or route cleanup leaks, hydration duplication, or public
entrypoint incompatibility.

Before simplifying internals, first add a characterization test for the
observable invariant. Remove the superseded ownership or rollback path in the
same change; do not leave obsolete internal adapters or parallel cleanup paths.
The public runtime and renderer compatibility adapters remain supported.
