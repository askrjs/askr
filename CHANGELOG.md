# Changelog

## Unreleased

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
