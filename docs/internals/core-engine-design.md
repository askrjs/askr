# Internals: Core Engine Design

This page documents the current `askr` core engine shape from the source tree.
It is intended as a design map for contributors, not as API-first user docs.

The diagrams below reflect the current boundaries in `src/boot`, `src/runtime`,
`src/renderer`, `src/router`, `src/ssr`, `src/ssg`, and `src/data`.

## 1. Big picture

This first diagram is the system view: how application code flows into the
reactive runtime, then out through routing, DOM rendering, and server-side
rendering pipelines.

```mermaid
flowchart TB
  app[Application code<br/>components, state, routes]
  publicApi[Public API surface<br/>src/index.ts, boot, router, data, ssr, ssg]

  subgraph engine[Core engine]
    boot[Boot orchestration<br/>index.ts, hydration.ts, types.ts]
    runtime[Runtime core<br/>component facade, state.ts, derive.ts, context.ts]
    componentCore[Component implementation<br/>component-internal.ts<br/>component-cleanup.ts<br/>component-scope.ts<br/>component-lifecycle.ts]
    forCore[For runtime implementation<br/>for-internal.ts<br/>for-reconcile.ts<br/>for-scopes.ts]
    runtimeAccess[Runtime access boundary<br/>access.ts]
    scheduler[Scheduler<br/>derived, component, reactive, post lanes]
    rendererBridge[Renderer bridge<br/>runtime.ts <-> renderer/index.ts]
    routerManifest[Route manifest and resolution<br/>authoring.ts, store.ts, manifest.ts, resolution.ts]
    asyncData[Async data<br/>resource-cell.ts and data modules]
  end

  subgraph outputs[Outputs]
    dom[DOM renderer<br/>dom facade, dom-internal.ts, component-host owners, element-children.ts, reconcile helpers, For commit helpers]
    spa[SPA navigation]
    ssr[SSR HTML rendering<br/>index facade, render-sync.ts, index-internal.ts, boundaries.ts, component-runtime.ts, route-render.ts]
    ssg[SSG batch generation]
  end

  app --> publicApi
  publicApi --> boot
  publicApi --> runtime
  publicApi --> routerManifest
  publicApi --> asyncData
  boot --> runtime
  boot --> routerManifest
  boot --> dom
  runtime --> runtimeAccess
  runtime --> componentCore
  runtime --> forCore
  runtimeAccess --> scheduler
  runtime --> rendererBridge
  asyncData --> runtime
  routerManifest --> spa
  routerManifest --> ssr
  routerManifest --> ssg
  rendererBridge --> dom
  scheduler --> dom
  spa --> dom
  ssg --> ssr
```

## 2. Module map

This is the static ownership view: which source areas own which responsibilities.

```mermaid
flowchart TB
  app[Application code]
  api[src/index.ts public API]

  subgraph core[Core reactive runtime]
    state[state.ts]
    derive[derive.ts]
    context[context.ts]
    componentFacade[component.ts facade]
    componentCore[component-internal.ts]
    componentCleanup[component-cleanup.ts]
    componentScope[component-scope.ts]
    componentCommit[component-commit.ts]
    componentLifecycle[component-lifecycle.ts]
    forFacade[for.ts facade]
    forCore[for-internal.ts]
    forReconcile[for-reconcile.ts]
    forScopes[for-scopes.ts]
    forSignals[for-signals.ts]
    readable[readable subscriptions]
    scheduler[scheduler.ts]
    runtime[runtime.ts]
    access[runtime/access.ts]
  end

  subgraph bootArea[Boot]
    bootIndex[boot/index.ts lifecycle facade]
    bootRoot[root-lifecycle.ts root instances and cleanup]
    bootStartup[route-startup.ts initial route resolution]
    bootHydration[hydration.ts selective hydration]
    bootTypes[types.ts boot config contracts]
  end

  subgraph render[DOM renderer]
    bridge[renderer/index.ts bridge]
    evaluate[evaluate.ts]
    evaluateRange[evaluate-dom-range.ts]
    evaluateReconcile[evaluate-reconcile.ts]
    domFacade[dom.ts facade]
    domCore[dom-internal.ts]
    domHost[dom-host.ts]
    componentHost[component-host.ts]
    componentInstances[component-host-instances.ts]
    componentCleanup[component-host-cleanup.ts]
    elementChildren[element-children.ts]
    errorBoundaryDom[error-boundary-dom.ts]
    stablePatch[stable-patch.ts]
    attrs[attributes.ts]
    boundaries[boundaries.ts]
    childShape[child-shape.ts]
    propBindings[prop-bindings.ts]
    reactiveChildren[reactive-children.ts]
    reactiveChildDom[reactive-child-dom.ts]
    reactiveChildSources[reactive-child-sources.ts]
    staticReuse[static-reuse.ts]
    reconcile[reconcile.ts]
    reconcileFast[reconcile-fastpaths.ts]
    reconcileResolution[reconcile-resolution.ts]
    reconcileCommit[reconcile-commit.ts]
    keyed[keyed.ts]
    keyedChildren[keyed-children.ts]
    namespaces[namespaces.ts]
    forCommit[for-commit.ts]
    forCommitMap[for-commit-dom-map.ts]
    forCommitReorder[for-commit-reorder.ts]
    cleanup[cleanup.ts]
  end

  subgraph route[Routing]
    routeFacade[route.ts facade]
    authoring[authoring.ts declarations]
    routeStore[store.ts state]
    routeManifest[manifest.ts registry and manifest]
    routeResolution[resolution.ts matching and requests]
    routeActivity[activity.ts current route]
    match[match.ts path ranking and params]
    nav[navigate.ts navigation orchestration]
    routeQuery[route-query.ts query updates]
    navRegistry[navigation-registry.ts app registration]
    navTargets[navigation-targets.ts route targets]
    navScroll[navigation-scroll.ts scroll restoration]
  end

  subgraph dataLayer[Async data]
    resource[resource-cell.ts]
    dataFacade[data/index.ts facade]
    dataRuntime[data-runtime.ts runtime and stores]
    queryCell[query-cell.ts query cells]
    mutationCell[mutation-cell.ts mutation cells]
    invalidation[invalidation.ts invalidation]
    dataTypes[types.ts public and internal contracts]
    queryKey[query-key.ts scoped key serialization]
    dataShared[shared.ts readable and error helpers]
  end

  subgraph server[Server outputs]
    ssrFacade[ssr/index.ts facade]
    ssrCore[index-internal.ts]
    renderSync[render-sync.ts]
    hydrationData[hydration-data.ts]
    hydrationVerify[hydration-verify.ts]
    ssrBoundaries[boundaries.ts]
    ssrComponents[component-runtime.ts]
    ssrRoute[route-render.ts]
    ssrHelpers[attrs, escape, sink, render-resolved]
    ssg[ssg/create-static-gen.ts]
  end

  app --> api
  api --> bootIndex
  bootIndex --> bootTypes
  bootIndex --> bootRoot
  bootIndex --> bootStartup
  bootIndex --> bootHydration
  bootIndex --> runtime
  bootIndex --> routeFacade
  bootIndex --> nav
  bootHydration --> dom
  api --> state
  api --> derive
  api --> context
  api --> runtime
  runtime --> access
  access --> scheduler
  state --> readable
  derive --> readable
  componentFacade --> componentCore
  componentCore --> componentCleanup
  componentFacade --> componentScope
  componentCore --> componentScope
  componentCore --> componentLifecycle
  componentCore --> readable
  componentCore --> access
  forFacade --> forCore
  forCore --> componentFacade
  forCore --> forReconcile
  forReconcile --> forScopes
  forScopes --> componentFacade
  forScopes --> forSignals
  forCore --> readable
  api --> bridge
  bridge --> runtime
  bridge --> evaluate
  evaluate --> domFacade
  evaluate --> evaluateRange
  evaluate --> evaluateReconcile
  evaluate --> reconcile
  evaluate --> componentFacade
  domFacade --> domCore
  domCore --> domHost
  domCore --> componentHost
  componentHost --> componentInstances
  domCore --> componentCleanup
  domCore --> elementChildren
  domCore --> errorBoundaryDom
  domCore --> stablePatch
  domCore --> attrs
  domCore --> boundaries
  domCore --> childShape
  domCore --> propBindings
  domCore --> reactiveChildren
  reactiveChildren --> reactiveChildDom
  reactiveChildren --> reactiveChildSources
  domCore --> staticReuse
  domCore --> namespaces
  domCore --> forCommit
  forCommit --> forCommitMap
  forCommit --> forCommitReorder
  evaluateReconcile --> namespaces
  boundaries --> namespaces
  reconcile --> keyedChildren
  reconcile --> reconcileFast
  reconcile --> reconcileResolution
  reconcile --> reconcileCommit
  reconcile --> keyed
  reconcile --> namespaces
  reconcile --> cleanup
  api --> routeFacade
  routeFacade --> authoring
  routeFacade --> routeManifest
  routeFacade --> routeResolution
  routeFacade --> routeActivity
  authoring --> routeStore
  authoring --> match
  routeManifest --> routeStore
  routeResolution --> routeStore
  routeResolution --> match
  routeActivity --> routeResolution
  nav --> routeFacade
  nav --> navTargets
  nav --> navRegistry
  nav --> routeQuery
  nav --> navScroll
  api --> resource
  api --> dataFacade
  dataFacade --> dataRuntime
  dataFacade --> queryCell
  dataFacade --> mutationCell
  dataFacade --> invalidation
  queryCell --> dataTypes
  queryCell --> queryKey
  queryCell --> dataShared
  mutationCell --> dataTypes
  invalidation --> dataRuntime
  routeResolution --> ssrFacade
  routeManifest --> ssg
  ssrFacade --> ssrCore
  ssrCore --> renderSync
  renderSync --> hydrationData
  ssrCore --> hydrationVerify
  renderSync --> ssrBoundaries
  renderSync --> ssrComponents
  ssrCore --> ssrRoute
  renderSync --> ssrHelpers
  componentFacade --> ssrComponents
  ssg --> ssrFacade
```

## 3. Drill-down pages

Use the dedicated internals pages below for the more detailed subsystem
diagrams:

- [Runtime reactivity](./runtime-reactivity.md)
- [Renderer pipeline](./renderer-pipeline.md)
- [SSR and SSG pipeline](./ssr-ssg-pipeline.md)
- [Router internals](./router-manifest.md)

## Design notes

- `src/runtime/runtime.ts` is intentionally small. It owns the scheduler and a
  pluggable renderer host instead of embedding DOM behavior directly.
- `src/runtime/component.ts`, `src/runtime/for.ts`, `src/renderer/dom.ts`, and
  `src/ssr/index.ts` are compatibility facades. Their current implementations
  live in `component-internal.ts` plus `component-scope.ts`,
  `component-commit.ts`, `component-lifecycle.ts`, and
  `component-cleanup.ts`,
  `for-internal.ts` plus `for-reconcile.ts`, `for-scopes.ts`, and
  `for-signals.ts`, `dom-internal.ts` plus its renderer helper owners, and the
  SSR `index-internal.ts` plus `render-sync.ts`, `hydration-data.ts`,
  `hydration-verify.ts`, `boundaries.ts`, `component-runtime.ts`, and
  `route-render.ts`.
- `src/runtime/access.ts` is the internal boundary used by runtime, renderer,
  data, and FX implementation paths when they need the default scheduler or
  renderer host. Compatibility globals remain exported from their original
  modules.
- `src/renderer/index.ts` installs the renderer bridge at package startup, which
  lets runtime primitives stay renderer-agnostic.
- `src/renderer/attributes.ts`, `src/renderer/child-shape.ts`,
  `src/renderer/prop-bindings.ts`, `src/renderer/reactive-children.ts`,
  `src/renderer/reactive-child-dom.ts`,
  `src/renderer/reactive-child-sources.ts`, `src/renderer/boundaries.ts`,
  `src/renderer/component-host.ts`,
  `src/renderer/component-host-instances.ts`,
  `src/renderer/component-host-cleanup.ts`, `src/renderer/element-children.ts`,
  `src/renderer/error-boundary-dom.ts`, and `src/renderer/stable-patch.ts` are
  active DOM renderer owners wired through `dom-internal.ts` or
  `component-host.ts`.
- `src/boot/index.ts` is the public lifecycle facade. `boot/root-lifecycle.ts`
  owns mounted root instances, cleanup, app navigation registration, and root
  remount behavior. `boot/route-startup.ts` owns initial route resolution and
  route-status component binding, `boot/types.ts` owns boot config contracts,
  and `boot/hydration.ts` owns selective hydration DOM helpers.
- `src/router/route.ts` is a facade. `authoring.ts`, `store.ts`,
  `manifest.ts`, `activity.ts`, and `resolution.ts` own the router
  responsibilities that used to live together, while `match.ts` handles
  ranking, segment parsing, and param extraction.
- `src/router/navigate.ts` owns browser history and popstate orchestration,
  while `navigation-targets.ts` owns route request cancellation and target
  application, `navigation-registry.ts` owns app registration and route
  snapshot synchronization, `route-query.ts` owns route query updates, and
  `navigation-scroll.ts` owns scroll restoration state.
- `src/data/index.ts` is the stable data facade. `data-runtime.ts` owns runtime
  state and stores, `query-cell.ts` owns `QueryCell` and `createQuery()`,
  `mutation-cell.ts` owns `MutationCell` and `createMutation()`,
  `invalidation.ts` owns invalidation helpers, `types.ts` owns the public and
  internal data contracts, `query-key.ts` owns scoped key serialization, and
  `shared.ts` owns readable notification and async error helpers used by data
  cells.
- `src/ssr/index.ts` is the stable SSR facade. `index-internal.ts` owns
  public SSR orchestration, `render-sync.ts` owns synchronous serialization,
  `hydration-data.ts` owns render-data script serialization,
  `hydration-verify.ts` owns hydration verifier state, `boundaries.ts` owns
  error/control boundary state helpers and fallback construction,
  `component-runtime.ts` owns synchronous component execution and temporary
  owner cleanup, and `route-render.ts` owns route/document orchestration for
  object-form rendering and streams.
- `src/ssg/create-static-gen.ts` is an orchestration layer over route expansion,
  SSR rendering, file output, and metadata generation rather than a separate
  rendering engine.

## Architecture Review Notes

The diagrams above are backed by architecture checks:

- No TypeScript source file may exceed the repository drift limit, and runtime,
  renderer, router, data, SSR, and SSG owners have explicit per-module line
  ceilings.
- SSG depends on SSR, not the other way around. Diagrams should keep that edge
  direction explicit because it is the contract that preserves one server
  renderer.
- The renderer helper owners (`attributes.ts`, `child-shape.ts`,
  `prop-bindings.ts`, `reactive-children.ts`, `reactive-child-dom.ts`,
  `reactive-child-sources.ts`, `boundaries.ts`, `component-host.ts`,
  `component-host-instances.ts`, `element-children.ts`, `stable-patch.ts`, and
  the reconcile/For commit helpers) are active dependencies. Future extraction
  should keep the running path wired to the owner modules rather than
  duplicating behavior.
- `For` state/hook ownership, reconciliation strategy, child-scope lifecycle,
  and item/index/property signal behavior are now split across
  `runtime/for-internal.ts`, `runtime/for-reconcile.ts`,
  `runtime/for-scopes.ts`, and `runtime/for-signals.ts`.

## Related docs

- [Core: Runtime](../core/runtime.md)
- [Core: Rendering](../core/rendering.md)
- [Core: Routing](../core/routing.md)
- [Core: Data](../core/data.md)
- [Runtime reactivity](./runtime-reactivity.md)
- [Renderer pipeline](./renderer-pipeline.md)
- [SSR and SSG pipeline](./ssr-ssg-pipeline.md)
- [Router internals](./router-manifest.md)
