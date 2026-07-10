# Changelog

## Unreleased

### 0.0.52 — audit remediation

- fix(release): rebuild packed artifacts from an absent `dist`, verify every
  export-map subpath and installed CLI, and keep source maps out of npm
  tarballs.
- fix(data): make query invalidation generation-safe, await reconciliation,
  normalize async failures, and retain mutation callbacks for an execution.
- fix(router): isolate initial route sources per root and keep history/route
  cleanup coherent when destination rendering or teardown fails.
- fix(ssg): publish full builds through staging/backup swap and incremental
  routes through temp-file replacement.
- test(quality): add declaration snapshots, dependency-edge coverage, and
  replayable lifecycle seed ranges.

## 0.0.51

- chore(quality): make release verification test packed consumers and public types, exclude source maps from npm tarballs, and replace architecture size checks with semantic boundaries.
- feat(router): add route-query updates for route-local filters without remounting the active route.
- feat(runtime): isolate render-scoped query caches, keep the first shared query contract, and evict entries when the last owner unmounts.
- feat(ssr): harden CSS style sanitization with an allowlist for safe functions and URI-scheme rejection, while resetting escape caches per request.
- fix(router): trim the public router barrel so internal manifest and SSR helpers stay on source-only paths.

## 0.0.29

- feat(state): support destructuring `const [get, set] = state(initial)`; getter remains callable and setter is identical to `get.set`. Added tests and docs.
