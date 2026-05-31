# Public Type Contract Audit

This audit treats the public TypeScript surface as framework contract. The canonical API surface is `package.json` `exports` plus the public barrel files under `src/`.

Dedicated contract tests live under `tests/types/`. Repository-level public-surface checks live under `tests/checks/`.

## Coverage Matrix

| Area | Public path(s) | Contract tests | Coverage focus |
| --- | --- | --- | --- |
| Reactivity | `@askrjs/askr` | `tests/types/reactivity.test-d.ts` | `state()`, `derive()`, `selector()`, `getSignal()`, inference, setter overloads, comparator typing |
| Resources | `@askrjs/askr/resources` | `tests/types/resource.test-d.ts` | `resource()`, `getSignal()`, deps inference, loader result typing, pending and error state, `refresh()`, invalid loaders |
| Data | `@askrjs/askr/data` | `tests/types/data.test-d.ts` | `createQuery()`, `createMutation()`, `invalidate()`, key and input inference, result typing, invalidation typing |
| Control Flow | `@askrjs/askr`, `@askrjs/askr/control` | `tests/types/control.test-d.tsx` | `For`, `Show`, `Case`, `Match`, item and index inference, key typing, fallback typing, invalid props |
| Context | `@askrjs/askr` | `tests/types/context.test-d.tsx` | `defineContext()`, `readContext()`, provider value enforcement, consumer inference |
| Router | `@askrjs/askr/router` | `tests/types/router.test-d.tsx` | `route()`, `page()`, `group()`, `lazy()`, `navigate()`, params, query, guards, policies, navigation options, route helper types |
| SSR | `@askrjs/askr/ssr` | `tests/types/ssr.test-d.ts` | `renderToString()`, `renderToStringSync()`, `renderToStream()`, `resolveRequest()`, SSR type exports, invalid request shapes |
| SSG | `@askrjs/askr/ssg` | `tests/types/ssg.test-d.ts` | `createStaticGen()`, config and result typing, route metadata, `RouteRenderReason` |
| Boot | `@askrjs/askr/boot` | `tests/types/boot.test-d.ts` | `createSPA()`, `hydrateSPA()`, `createIsland()`, `createIslands()`, `cleanupApp()`, `hasApp()`, config typing |
| JSX | `@askrjs/askr`, `@askrjs/askr/jsx-runtime`, `@askrjs/askr/jsx-dev-runtime` | `tests/types/jsx.test-d.tsx` | intrinsic elements, handlers, refs, children, fragments, class and style contracts, runtime entrypoints |
| Components | `@askrjs/askr/components` | `tests/types/components.test-d.tsx` | `ErrorBoundary`, `ErrorBoundaryProps`, `ErrorBoundaryFallbackRender` |
| Foundations | `@askrjs/askr/foundations` and `@askrjs/askr/foundations/*` | `tests/types/foundations.test-d.tsx` | structural exports, utilities, interactions, controllable state, collection and layer types, icon contracts |
| FX | `@askrjs/askr/fx` | `tests/types/fx.test-d.ts` | timing and scheduling helpers, callback generics, invalid wrapper inputs |
| Public entrypoints | every `package.json` export path | `tests/types/public-entrypoints.test-d.ts` | documented import paths, boundary negatives, accidental exports, root-vs-subpath separation |
| Repo checks | all public export paths plus docs | `tests/checks/public-api-type-coverage.test.ts`, `tests/checks/docs/public-api-snippets.test.ts`, `tests/checks/docs/public-api-imports.test.ts` | export coverage, docs snippet compilation, docs specifier validation, clean-checkout dist probing |

## Missing Type Contracts

No uncovered export symbols remain under the current `package.json` export map. `tests/checks/public-api-type-coverage.test.ts` fails if any public export is not referenced directly in `tests/types/`.

Remaining gaps are deeper contract risks rather than missing public names:

- JSX intrinsic props, events, and refs are still limited by the broad `Props` index signature.
- `Case` cannot statically restrict its children to `Match` with the current JSX element model.
- SSG `entries()` keys are not checked against route-path `{param}` placeholders.
- Query and mutation status and error shapes are still looser than a discriminated-state contract.
- Function-valued `state()` usage remains a subtle edge because updater callbacks and function payloads share syntax.

## Runtime and Type Mismatches

Fixed in this pass:

- `@askrjs/askr/ssr` exposed `renderResolvedToStringSync`, an internal resolved-route renderer that should not have been public.
- `@askrjs/askr/jsx-runtime` and `@askrjs/askr/jsx-dev-runtime` exposed `ELEMENT_TYPE`, an implementation detail with no supported app-facing contract.
- Docs compatibility previously stopped at import-path scanning. Published snippets that import `@askrjs/askr*` now compile unchanged from `docs/` and `README.md`.
- The docs import/export probe previously depended on a prebuilt `dist/` tree. It now builds when `dist/` is missing and validates documented specifiers against `package.json` exports.

No additional public runtime/type mismatches were confirmed in this pass.

## First 20 Type Tests

These were the first twenty contract tests added or expanded from this plan:

1. `CaseProps` root export assignability and `Case(...)` call shape in `tests/types/control.test-d.tsx`.
2. `ForProps` direct export parity with `For` in `tests/types/control.test-d.tsx`.
3. `ShowProps` direct export parity with `Show` in `tests/types/control.test-d.tsx`.
4. `ErrorBoundaryProps` fallback and children typing in `tests/types/components.test-d.tsx`.
5. `ErrorBoundaryFallbackRender` parameter and return typing in `tests/types/components.test-d.tsx`.
6. `DefaultPortal` callable and render shape in `tests/types/foundations.test-d.tsx`.
7. `ComposeHandlersOptions` option typing in `tests/types/foundations.test-d.tsx`.
8. `Ref`, `composeRefs`, and `setRef` object and function ref compatibility in `tests/types/foundations.test-d.tsx`.
9. `FormatIdOptions` and `formatId` option and result typing in `tests/types/foundations.test-d.tsx`.
10. `DefaultPreventable`, `FocusLikeEvent`, `KeyboardLikeEvent`, `PointerLikeEvent`, and `PropagationStoppable` type exports in `tests/types/foundations.test-d.tsx`.
11. `PressableOptions` and `PressableResult` typing in `tests/types/foundations.test-d.tsx`.
12. `DismissableOptions` typing in `tests/types/foundations.test-d.tsx`.
13. `FocusableOptions` and `FocusableResult` typing in `tests/types/foundations.test-d.tsx`.
14. `HoverableOptions` and `HoverableResult` typing in `tests/types/foundations.test-d.tsx`.
15. `Orientation`, `RovingFocusOptions`, `RovingFocusResult`, and `InteractionPolicyInput` typing in `tests/types/foundations.test-d.tsx`.
16. `ControllableState`, `CollectionItem`, `Layer`, `LayerOptions`, `IconOwnProps`, `IconSizeToken`, and `IconStyleObject` typing in `tests/types/foundations.test-d.tsx`.
17. Router type-only exports including `RegisterRoutesOptions`, `GroupHelperOptions`, `RouteDefinition`, `RouteRequestOptions`, `NavigateOptions`, `ScrollRestorationOptions`, and `LinkProps` in `tests/types/router.test-d.tsx`.
18. SSG `RouteRenderReason` and related result metadata typing in `tests/types/ssg.test-d.ts`.
19. Negative contract test that `renderResolvedToStringSync` is not publicly importable from `@askrjs/askr/ssr` in `tests/types/public-entrypoints.test-d.ts`.
20. Negative contract tests that `ELEMENT_TYPE` is not publicly importable from `@askrjs/askr/jsx-runtime` or `@askrjs/askr/jsx-dev-runtime` in `tests/types/public-entrypoints.test-d.ts`.

## Confirmed Failures

The audit confirmed the following public-surface failures before fixes:

- `renderResolvedToStringSync` leaked through `@askrjs/askr/ssr`.
- `ELEMENT_TYPE` leaked through both public JSX runtime entrypoints.
- `@askrjs/askr/components` had no dedicated type-test file.
- Several public type-only exports were not directly asserted anywhere in `tests/types/`.
- There was no repo check enforcing one direct type-test reference per public export symbol.
- There was no docs-snippet compile harness for published `@askrjs/askr*` examples.
- The docs import/export check did not validate every documented specifier against the `exports` map and could rely on a stale `dist/` directory.

## Minimal Fixes

The audit stayed within minimal public-contract fixes:

- Removed `renderResolvedToStringSync` from the public SSR entrypoint.
- Added `src/ssr/render-resolved.ts` as an internal-only resolved-render helper for internal tests and callers.
- Switched internal SSR and SSG callers to `renderToString()` or the new internal helper instead of the public leak.
- Removed `ELEMENT_TYPE` from the public JSX runtime and JSX dev runtime entrypoints.
- Added `tests/types/components.test-d.tsx`.
- Expanded `tests/types/control.test-d.tsx`, `tests/types/foundations.test-d.tsx`, `tests/types/router.test-d.tsx`, `tests/types/ssg.test-d.ts`, `tests/types/jsx.test-d.tsx`, and `tests/types/public-entrypoints.test-d.ts`.
- Added `tests/checks/public-api-type-coverage.test.ts`.
- Added `tests/checks/docs/public-api-snippets.test.ts`.
- Hardened `tests/checks/docs/public-api-imports.test.ts` to validate documented specifiers against `package.json` exports and to build `dist/` when needed.
- Added runtime public-boundary checks in `tests/unit/utils/public-entrypoints-resolve.test.ts` and `tests/unit/utils/jsx-runtime-resolve.test.ts`.

## Remaining Risk

- The docs snippet compiler intentionally targets Markdown snippets in `docs/` and `README.md` that import `@askrjs/askr*`. Other examples remain covered by the existing repo checks rather than this harness.
- The export-coverage check is identifier-based. It guarantees direct references exist, but it does not prove every overload branch is exhaustively asserted.
- Broad helper types can still regress semantically if assignability stays unchanged.
- The audit boundary is the `package.json` export map. Deep imports outside that map remain intentionally unsupported and out of scope.
