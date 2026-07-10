# Development: Quality Contracts

Runtime changes are governed by observable invariants, not module size or
function names. A change must name the contract it affects and extend the
durable test family that observes it.

## Dependency and ownership map

- `runtime` is platform-neutral. It does not depend on renderer, boot, SSR, or
  SSG implementations. External subsystems use `runtime/index.ts`, while
  default scheduler and runtime access stays behind `runtime/access.ts`.
- `renderer` owns browser DOM mutation. Reconciliation enters through
  `reconcile-commit.ts`, which either commits the target node sequence or
  restores a coherent replacement on failure.
- `component-cleanup.ts` owns component shutdown: child scopes, registered
  cleanup, readable subscriptions, abort signalling, and generation
  invalidation complete before cleanup errors are surfaced.
- `ssr` and `ssg` do not depend on browser renderer internals. Synchronous SSR
  remains the documented rendering boundary.

## Test families

- `tests/checks/architecture.test.ts` protects dependency direction, facades,
  singleton access, server/browser separation, lifecycle ownership, and the
  reconciliation commit boundary.
- `tests/jsdom/runtime/lifecycle-sequences.test.tsx` replays deterministic
  mount/update/flush/dispose sequences. Add the failing seed to its table when
  fixing a sequence failure.
- jsdom and browser flow suites cover hydration, navigation/resource races,
  mixed control boundaries, portals, and nested layout teardown. Use deferred
  promises or fake timers for scheduler/router/resource tests; real time is
  reserved for browser integration behavior that requires it.
- SSG tests cover route planning, parameter expansion, incremental cleanup,
  and failed generation behavior.

Before simplifying internals, first add a characterization test for the
observable invariant. Remove the superseded ownership or rollback path in the
same change; do not leave compatibility wrappers or parallel cleanup paths.
