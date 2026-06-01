# Public Type Contract Audit

This audit treats the public TypeScript surface as framework contract. The canonical API surface is `package.json` `exports` plus the public barrel files under `src/`.

Dedicated contract tests live under `tests/types/`. Repository-level public-surface checks live under `tests/checks/`.

## Coverage Matrix

| Area               | Public path(s)                                                             | Contract tests                                                                                                                                   | Coverage focus                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reactivity         | `@askrjs/askr`                                                             | `tests/types/reactivity.test-d.ts`                                                                                                               | `state()`, `derive()`, `selector()`, `getSignal()`, inference, setter overloads, comparator typing                                                                         |
| Resources          | `@askrjs/askr/resources`                                                   | `tests/types/resource.test-d.ts`                                                                                                                 | `resource()`, `getSignal()`, deps inference, loader result typing, pending and error state, `refresh()`, invalid loaders                                                   |
| Data               | `@askrjs/askr/data`                                                        | `tests/types/data.test-d.ts`                                                                                                                     | `createQuery()`, `createMutation()`, `invalidate()`, key and input inference, query and mutation state narrowing, result typing, invalidation typing                       |
| Control Flow       | `@askrjs/askr`, `@askrjs/askr/control`                                     | `tests/types/control.test-d.tsx`                                                                                                                 | `For`, `Show`, `Case`, `Match`, item and index inference, key typing, fallback typing, invalid props                                                                       |
| Context            | `@askrjs/askr`                                                             | `tests/types/context.test-d.tsx`                                                                                                                 | `defineContext()`, `readContext()`, provider value enforcement, provider child contract, consumer inference                                                                |
| Router             | `@askrjs/askr/router`                                                      | `tests/types/router.test-d.tsx`                                                                                                                  | `route()`, `page()`, `group()`, `lazy()`, `navigate()`, params, query, guards, policies, navigation options, route helper types                                            |
| SSR                | `@askrjs/askr/ssr`                                                         | `tests/types/ssr.test-d.ts`                                                                                                                      | `renderToString()`, `renderToStringSync()`, `renderToStream()`, `resolveRequest()`, SSR type exports, invalid request shapes                                               |
| SSG                | `@askrjs/askr/ssg`                                                         | `tests/types/ssg.test-d.ts`                                                                                                                      | `createStaticGen()`, config and result typing, route metadata, `RouteRenderReason`                                                                                         |
| Boot               | `@askrjs/askr/boot`                                                        | `tests/types/boot.test-d.ts`                                                                                                                     | `createSPA()`, `hydrateSPA()`, `createIsland()`, `createIslands()`, `cleanupApp()`, `hasApp()`, config typing                                                              |
| JSX                | `@askrjs/askr`, `@askrjs/askr/jsx-runtime`, `@askrjs/askr/jsx-dev-runtime` | `tests/types/jsx.test-d.tsx`                                                                                                                     | intrinsic elements, handlers, refs, children, fragments, class and style contracts, runtime entrypoints                                                                    |
| Components         | `@askrjs/askr/components`                                                  | `tests/types/components.test-d.tsx`                                                                                                              | `ErrorBoundary`, `ErrorBoundaryProps`, `ErrorBoundaryFallbackRender`                                                                                                       |
| Foundations        | `@askrjs/askr/foundations` and `@askrjs/askr/foundations/*`                | `tests/types/foundations.test-d.tsx`                                                                                                             | structural exports, utilities, interactions, controllable state, collection and layer types, icon contracts                                                                |
| FX                 | `@askrjs/askr/fx`                                                          | `tests/types/fx.test-d.ts`                                                                                                                       | timing and scheduling helpers, callback generics, invalid wrapper inputs                                                                                                   |
| Public entrypoints | every `package.json` export path                                           | `tests/types/public-entrypoints.test-d.ts`                                                                                                       | documented import paths, boundary negatives, accidental exports, root-vs-subpath separation                                                                                |
| Repo checks        | all public export paths plus docs                                          | `tests/checks/public-api-type-coverage.test.ts`, `tests/checks/docs/public-api-snippets.test.ts`, `tests/checks/docs/public-api-imports.test.ts` | export coverage, docs snippet compilation, `typescript` fence aliases, user-facing docs syntax and HTML validation, docs specifier validation, clean-checkout dist probing |

## Missing Type Contracts

No uncovered export symbols remain under the current `package.json` export map. `tests/checks/public-api-type-coverage.test.ts` fails if any public export is not referenced directly in `tests/types/`.

Remaining gaps are deeper contract risks rather than missing public names:

- JSX intrinsic elements now type common `class`, `style`, `ref`, high-use event handlers, tag-specific attributes for high-use interactive and form tags such as `a`, `button`, `form`, `input`, `label`, `select`, `option`, and `textarea`, common layout/content tags such as `div`, `span`, `section`, `main`, `article`, `header`, `footer`, `nav`, `p`, and headings, common semantic inline/content tags such as `blockquote`, `code`, `em`, `figure`, `figcaption`, `pre`, `small`, and `strong`, common list/table/output tags such as `ul`, `li`, `ol`, `table`, `caption`, `thead`, `tbody`, `tfoot`, `tr`, `td`, `th`, and `output`, and common SVG tags such as `svg`, `g`, `circle`, `rect`, `path`, and `title`, including explicit table-cell props like `colSpan`, `rowSpan`, `headers`, `scope`, and `abbr`, output props like `htmlFor`, `name`, and `form`, and common SVG props like `viewBox`, `strokeWidth`, `strokeLinecap`, `strokeLinejoin`, `fillRule`, and `clipRule`. Less-common intrinsic tags and arbitrary unknown tags still fall back to a broader `Props`-compatible contract.
- `Case` still cannot statically restrict its children to `Match` with the current JSX element model, even though development runtime validation rejects invalid direct children.

## Runtime and Type Mismatches

Fixed in this pass:

- `@askrjs/askr/ssr` exposed `renderResolvedToStringSync`, an internal resolved-route renderer that should not have been public.
- `@askrjs/askr/jsx-runtime` and `@askrjs/askr/jsx-dev-runtime` exposed `ELEMENT_TYPE`, an implementation detail with no supported app-facing contract.
- Docs compatibility previously stopped at import-path scanning. Published snippets that import `@askrjs/askr*` now compile unchanged from `docs/` and `README.md`.
- SSG `entries()` now matches its public contract: parameterized routes expand at runtime, concrete-path data overrides resolve correctly, and path placeholders are checked in both direct `RouteConfig<'...'>` annotations and inline `createStaticGen({ routes: [...] })` calls.
- The docs import/export probe previously depended on a prebuilt `dist/` tree. It now builds when `dist/` is missing and validates documented specifiers against `package.json` exports.
- The checked example source under `examples/` now compiles against public imports rather than bypassing the package surface entirely.
- `Context.Scope` accepted arbitrary `unknown` children even though provider content flows through the normal renderable-child pipeline, and its truthiness checks could drop valid scalar children like `0` and `''`.
- `Outlet()` returned broad `RenderableChild`, which prevented the documented `<Outlet />` usage from typechecking even though page hosts use it like a normal JSX component.
- The docs snippet compiler's virtual root paths were not normalized on Windows, so root-file-not-found diagnostics could be dropped and some published snippets were not actually being typechecked there. That also let the stale `ThemeContext.provide(...)` docs example slip past the check.
- Published docs still had several stale or malformed examples after the harness started checking them for real: URL-based SSR examples omitted the required `routes` table, `For` examples skipped the explicit `by` or `byIndex` contract, some data examples relied on untyped external services and lost inference, and a few guide snippets had invalid JSX syntax or outdated router authoring.
- User-facing docs fences labeled `typescript` were still outside the compile harness, so malformed selective-hydration and SSR-event examples could drift without tripping the docs checks.
- User-facing `html` fences were not validated at all, so malformed markup such as the broken selective-hydration polyfill `<script>` example could slip through.
- Shared `createQuery()` definitions were keyed only by `key`, but the public docs did not say that later readers or rerenders must keep `fetch`, `isConsistent`, and `reconcile` aligned with the original definition, so conflicting shared queries could silently keep using the first definition.
- `onPointerDownCapture` was publicly typed and returned by `dismissable()`, but the renderer still treated capture-suffixed props as literal event names like `pointerdowncapture`, so mounted capture listeners never fired.
- The shipped `dismissable()` examples also spread those capture props onto the protected dialog node itself, even though real outside-click detection only works when the capture surface encloses both the protected node and the outside interaction path.
- Common mouse event props such as `onMouseOver`, `onMouseOut`, and `onMouseMove` were also supported by the runtime event system but omitted from the typed intrinsic event surface.
- JSX `htmlFor` was typed and documented as a public compatibility prop, but the initial client render and SSR attribute writers still emitted `htmlfor` instead of the real DOM `for` attribute.
- Settled query stale states still required apps to infer the underlying reason indirectly from `error`, `data`, and comments, even though runtime already distinguished inconsistent data, abort-like cancellations, and fetch failures.
- Common SVG compatibility props such as `strokeWidth`, `strokeLinecap`, `strokeLinejoin`, `fillRule`, and `clipRule` still rendered with their raw camelCase prop names, even though app-facing JSX usage expects those public props to map to real SVG attribute names.

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
- The docs snippet compile harness also had a Windows path-normalization hole that could silently skip snippet typechecking.
- The docs snippet harness also ignored `typescript`-labeled guide examples and did not validate fenced `html` snippets, so several user-facing malformed examples were never exercised.
- Capture-suffixed intrinsic event props such as `onPointerDownCapture` were typed, but mounted DOM listeners used the wrong raw event name and never observed the real capture phase.
- SSG `entries()` did not actually expand parameterized routes even though the public contract documented that behavior.
- The docs import/export check did not validate every documented specifier against the `exports` map and could rely on a stale `dist/` directory.
- `StateSetter<T>` accepted direct function values even though the runtime always interprets function arguments as updater callbacks.
- `Mutation<TInput, TResult>` exposed a broad nullable shape even though runtime status already determined when `pending`, `result`, and `error` were available.
- `Query<T>` exposed broad booleans even though `loading`, `consistency`, and refresh semantics already determined when data had to be present.
- `Query<T>` also collapsed impossible stale combinations, forcing app code to treat `stale` as if it could mean `data === null && error === null` even though runtime never produces that state.
- `Query<T>` also exposed settled stale states without an explicit reason, forcing app code to infer whether stale meant inconsistent data, an abort-like cancellation, or a fetch failure from secondary fields.
- `createQuery()` also allowed `null` and `undefined` payloads even though runtime reserves `null` as the unresolved-data sentinel.
- Query and mutation error states could also surface a nullish thrown value directly, undermining any type claim that an error state always carried an error payload.
- Intrinsic JSX elements did not type `class`, `style`, `ref`, `value`, `checked`, or common event handler props even though the renderer already had specialized behavior for them.
- High-use intrinsic tags such as `button`, `input`, `form`, and `a` also accepted any additional attributes through the generic fallback contract, so common mistakes like `href` on `<button>` or non-boolean `disabled` values were not caught.
- Common layout/content tags such as `div`, `span`, `section`, and `main` also inherited the generic fallback contract, so app-facing mistakes like `href` on `<div>` or `disabled` on `<section>` compiled even though those props were not part of the intended public contract.
- Common semantic list and table tags such as `ul`, `li`, `table`, `thead`, `tbody`, `tr`, `td`, and `th` also still inherited the generic fallback contract, so app-facing mistakes like `href` on `<ul>` or `disabled` on `<table>` compiled even though those props were not part of the intended public contract.
- Common table-cell props such as `colSpan`, `rowSpan`, `headers`, `scope`, and `abbr` also still compiled only through the generic fallback contract on `td` and `th`, so their intended value shapes were not actually enforced.
- Common semantic inline/content tags such as `em`, `strong`, `small`, `code`, `pre`, `blockquote`, `figure`, and `figcaption`, plus `output`, also still compiled through the generic fallback contract, so app-facing mistakes like `disabled` on `<em>` or untyped `htmlFor` / `form` / `name` on `<output>` were not enforced directly.
- Common SVG tags such as `svg`, `g`, `circle`, `rect`, and `path` also still compiled through the generic fallback contract, so app-facing mistakes around props like `strokeWidth`, `fillRule`, `cx`, `r`, and `d` were not enforced directly.
- `MatchProps['children']` stayed as `unknown` even though runtime only accepts a direct JSX node or zero-argument thunk.
- `ShowProps<T>` used `NonNullable<T>` for function children even though runtime only invokes that callback for truthy values.
- Control-flow fallback props stayed as `unknown` even though runtime only normalizes JSX boundary content, and `Match` thunk children were typed as returning a single vnode even though runtime also accepts fragment or array results.
- `ErrorBoundaryProps['fallback']` and `ErrorBoundaryFallbackRender` stayed as `unknown` even though the client runtime only supports normal boundary content there, plus an imperative DOM `Node` fallback branch.
- `ErrorBoundaryProps['children']` also stayed as `unknown` even though passing a raw DOM `Node` child silently renders nothing in the current client renderer.
- `LinkProps['children']`, `PresenceProps['children']`, `PortalProps['children']`, `SlotProps` in fragment mode, and layout helper children all accepted arbitrary `unknown` even though the renderer only mounts normal renderable content there and silently ignores raw DOM `Node` children.
- `RouteComponent`, `RouteHandler`, router `group()` layouts, and `lazy()` route stubs also returned broad `unknown` even though their values feed directly into route rendering and raw DOM `Node` results are silently ignored there too.
- `Context.Scope` also accepted arbitrary `unknown` children even though it only forwards normal renderable content or a zero-argument render callback, and its provider runtime used truthiness checks that could drop valid scalar children like `0` or `''`.
- `Outlet()` also returned broad `RenderableChild`, so `<Outlet />` in page-host examples failed to typecheck even though runtime routing treats it as a normal JSX component.
- Several published docs snippets drifted from the current public contract or were malformed, including URL-based `renderToString()` examples without `routes`, `For` examples without explicit `by` or `byIndex`, stale router-internals `layout()` authoring, untyped query or mutation service examples, and invalid JSX such as `label for=...`.
- The shipped `dismissable()` examples also mounted outside-click capture props on the protected element itself, even though that DOM topology cannot observe sibling or backdrop clicks.
- Shared queries also kept the first callback definition for a key silently, even when later readers or same-reader rerenders passed conflicting `fetch`, `isConsistent`, or `reconcile` callbacks for that same key.
- `htmlFor` also only normalized during stale-attribute bookkeeping, so first render, reactive updates, and SSR markup could all disagree with the public contract and produce `htmlfor` instead of `for`.

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
- Normalized virtual snippet root paths in `tests/checks/docs/public-api-snippets.test.ts` so published docs snippets are actually compiled on Windows too.
- Expanded `tests/checks/docs/public-api-snippets.test.ts` to recognize `typescript` and `javascript` fence aliases, syntax-check non-placeholder user-facing TS/TSX/JS/JSX examples, and validate fenced user-facing HTML snippets for well-formedness.
- Normalized capture-suffixed intrinsic event props to their underlying DOM event names, preserved capture-vs-bubble listener identity in the renderer, and kept capture handlers as direct listeners instead of delegated ones.
- Updated `dismissable()` guidance and mounted regression coverage so outside-click detection uses a wrapper or overlay capture surface that can actually observe both inside and outside pointer paths in the real DOM.
- Added typed intrinsic support for common mouse event props `onMouseOver`, `onMouseOut`, and `onMouseMove`, matching the runtime event system.
- Updated the stale context example in `docs/core/data.md` to use `Context.Scope`, matching the real public API instead of the removed `.provide()` shape.
- Tightened SSG `RouteConfig` and `createStaticGen()` typing so parameterized `params` and `entries()` shapes follow the route path in both annotated and inline usage.
- Expanded SSG generation to materialize `entries()` into concrete routes and resolve data overrides by concrete path.
- Hardened `tests/checks/docs/public-api-imports.test.ts` to validate documented specifiers against `package.json` exports and to build `dist/` when needed.
- Added example-source compilation coverage for public imports under `examples/`.
- Added runtime public-boundary checks in `tests/unit/utils/public-entrypoints-resolve.test.ts` and `tests/unit/utils/jsx-runtime-resolve.test.ts`.
- Tightened `StateSetter<T>` so any state type that can hold a function only accepts updater form, matching runtime behavior and preventing accidental direct function assignment.
- Tightened `Mutation<TInput, TResult>` into a status-discriminated public contract and aligned `abort()` with that contract so it only cancels in-flight executions.
- Tightened `Query<T>` so first-load, refresh, and pending-write states narrow around `loading`, `refreshing`, `consistency`, and data availability, and fixed pending-write so it is only exposed when cached data actually exists.
- Tightened `Query<T>` stale variants so error-free stale states always carry data, surfaced error states always stop refreshing, and empty stale states only occur when a fetch failed before any data was available.
- Added `Query['staleReason']` as a settled-stale discriminant so apps can distinguish inconsistent data, abort-like cancellations, and fetch failures directly instead of inferring from `error` and `data` alone.
- Rejected `createQuery()` loaders that resolve to `null` or `undefined`, matching the runtime sentinel semantics instead of allowing an ambiguous payload contract.
- Normalized nullish thrown values in query and mutation failures before storing them on public state, so surfaced error states always carry a non-null error value.
- Added stricter intrinsic JSX typing for the renderer's special-case DOM props and removed the broad `jsx()` fallback overloads that previously let invalid intrinsic props compile unchecked.
- Added tag-specific JSX attribute contracts for high-use interactive and form tags while keeping a generic fallback for arbitrary tags and dynamic prop spreads.
- Added layout/content-tag JSX attribute contracts for common tags such as `div`, `span`, `section`, `main`, `article`, `header`, `footer`, `nav`, `p`, and headings, while still keeping the generic fallback for less-common tags and dynamic prop spreads.
- Added list/table-tag JSX attribute contracts for common semantic tags such as `ul`, `li`, `ol`, `table`, `caption`, `thead`, `tbody`, `tfoot`, `tr`, `td`, and `th`, while still keeping the generic fallback for less-common tags and dynamic prop spreads.
- Added explicit table-cell JSX attribute contracts for `td` and `th`, including `colSpan`, `rowSpan`, `headers`, `scope`, and `abbr`, instead of relying on the generic fallback to admit those props loosely.
- Added explicit semantic inline/content-tag JSX contracts for `em`, `strong`, `small`, `code`, `pre`, `blockquote`, `figure`, and `figcaption`, plus an explicit `output` contract for `htmlFor`, `name`, and `form`, instead of relying on the generic fallback to admit those props loosely.
- Added explicit SVG JSX contracts for `svg`, `g`, `circle`, `rect`, `path`, and `title`, including common props such as `viewBox`, `strokeWidth`, `strokeLinecap`, `strokeLinejoin`, `fillRule`, `clipRule`, `cx`, `cy`, `r`, and `d`.
- Tightened `Match` children to a JSX node or zero-argument thunk to match runtime behavior and prevent render-prop misuse that would otherwise receive no arguments at runtime.
- Tightened `Show` function-child inference so literal falsey branches are excluded from the callback value type, matching the runtime truthiness check instead of only removing `null` and `undefined`.
- Tightened `Show`, `For`, and `Case` fallback props to normal boundary content and widened `Match` thunk children to allow fragment or array results, matching the shared boundary normalizer instead of treating those props as either `unknown` or a single-vnode-only shape.
- Tightened `ErrorBoundary` children to normal boundary content and tightened fallback typing to normal boundary content or an imperative DOM `Node`, matching the renderer's real supported branches instead of accepting arbitrary unknown values.
- Tightened `Link`, `Presence`, `Portal`, `DefaultPortal`, `Slot` fragment mode, layout helpers, and router layout records to normal renderable child content, matching the renderer's real supported child shapes instead of accepting arbitrary unknown values that would silently disappear at runtime.
- Tightened route-page, route-handler, router-layout, and `lazy()` return contracts to normal renderable content so route outputs match what the renderer can actually mount, and added negative coverage for imperative DOM `Node` returns that would otherwise disappear at runtime.
- Tightened `Context.Scope` children to normal renderable content or a zero-argument render callback, matching the provider runtime's supported branches, and fixed the provider's scalar child checks so single `0` and `''` children are preserved instead of being dropped by truthiness.
- Tightened `Outlet()` to return a Fragment-backed `JSXElement`, preserving runtime output while making the documented `<Outlet />` page-host usage typecheck correctly.
- Updated published docs snippets to match the current public contract: URL-based SSR examples now pass explicit `routes`, `For` examples show explicit `by` or `byIndex`, query and mutation examples keep their shapes typed when external services are only placeholders, malformed JSX was corrected, stale router internals examples now use `group({ layout })` instead of the removed `layout()` helper, and user-facing selective-hydration / event-delegation / SSR-event snippets now parse and serialize cleanly under the stronger docs checks.
- Updated the event-delegation guide so capture-suffixed JSX props are documented as direct capture listeners, and clarified that outside-click helpers such as `dismissable()` must mount those handlers on a wrapper or overlay surface instead of the protected node itself.
- Added a development warning when a shared query key is redefined with conflicting `fetch`, `isConsistent`, or `reconcile` callbacks across readers or rerenders, and documented that a query key defines the shared query contract rather than just the cached value slot.
- Normalized `htmlFor` to `for` across initial DOM writes, reactive prop updates and removals, SSR attribute rendering, and SSR DOM verification, matching the documented public JSX contract instead of emitting the raw prop name.
- Normalized common camelCase SVG props such as `strokeWidth`, `strokeLinecap`, `strokeLinejoin`, `fillRule`, and `clipRule` to their real SVG attribute names across DOM writes, reactive updates, SSR rendering, and SSR verification.

## Remaining Risk

- The docs compiler now covers published user-facing Markdown snippets under `docs/` and `README.md`, plus checked public-import source files under `examples/`, but it still does not validate arbitrary external app code.
- The export-coverage check is identifier-based. It guarantees direct references exist, but it does not prove every overload branch is exhaustively asserted.
- Broad helper types can still regress semantically if assignability stays unchanged.
- `dismissable()` still relies on caller topology: types can enforce the handler names and node reference shape, but they cannot prove the chosen capture surface actually encloses the outside-click path.
- The audit boundary is the `package.json` export map. Deep imports outside that map remain intentionally unsupported and out of scope.
