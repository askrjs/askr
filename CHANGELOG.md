# Changelog

## Unreleased

## 0.0.52

- chore(quality): make release verification test packed consumers and public types, exclude source maps from npm tarballs, and replace architecture size checks with semantic boundaries.
- feat(router): add route-query updates for route-local filters without remounting the active route.
- feat(runtime): isolate render-scoped query caches, keep the first shared query contract, and evict entries when the last owner unmounts.
- feat(ssr): harden CSS style sanitization with an allowlist for safe functions and URI-scheme rejection, while resetting escape caches per request.
- fix(router): trim the public router barrel so internal manifest and SSR helpers stay on source-only paths.

## 0.0.29

- feat(state): support destructuring `const [get, set] = state(initial)`; getter remains callable and setter is identical to `get.set`. Added tests and docs.
