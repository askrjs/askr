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
    runtime[Runtime core<br/>component.ts, state.ts, derive.ts, context.ts]
    runtimeAccess[Runtime access boundary<br/>access.ts]
    scheduler[Scheduler<br/>derived, component, reactive, post lanes]
    rendererBridge[Renderer bridge<br/>runtime.ts <-> renderer/index.ts]
    routerManifest[Route manifest and resolution<br/>authoring.ts, store.ts, manifest.ts, resolution.ts]
    asyncData[Async data<br/>resource-cell.ts and data modules]
  end

  subgraph outputs[Outputs]
    dom[DOM renderer<br/>evaluate.ts, dom.ts, reconcile.ts, keyed-children.ts, namespaces.ts]
    spa[SPA navigation]
    ssr[SSR HTML rendering]
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
  runtimeAccess --> scheduler
  runtime --> rendererBridge
  asyncData --> runtime
  routerManifest --> spa
  routerManifest --> ssr
  routerManifest --> ssg
  rendererBridge --> dom
  scheduler --> dom
  spa --> dom
  ssr --> ssg
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
    component[component.ts]
    readable[readable subscriptions]
    scheduler[scheduler.ts]
    runtime[runtime.ts]
    access[runtime/access.ts]
  end

  subgraph bootArea[Boot]
    bootIndex[boot/index.ts lifecycle facade]
    bootHydration[hydration.ts selective hydration]
    bootTypes[types.ts boot config contracts]
  end

  subgraph render[DOM renderer]
    bridge[renderer/index.ts bridge]
    evaluate[evaluate.ts]
    dom[dom.ts]
    reconcile[reconcile and keyed fast paths]
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
    navScroll[navigation-scroll.ts scroll restoration]
  end

  subgraph dataLayer[Async data]
    resource[resource-cell.ts]
    query[data/index.ts query and mutation runtime]
    dataTypes[types.ts public and internal contracts]
    queryKey[query-key.ts scoped key serialization]
    dataShared[shared.ts readable and error helpers]
  end

  subgraph server[Server outputs]
    ssr[ssr/index.ts]
    ssg[ssg/create-static-gen.ts]
  end

  app --> api
  api --> bootIndex
  bootIndex --> bootTypes
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
  component --> readable
  component --> access
  api --> bridge
  bridge --> runtime
  bridge --> evaluate
  evaluate --> dom
  evaluate --> reconcile
  evaluate --> component
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
  nav --> navScroll
  api --> resource
  api --> query
  query --> dataTypes
  query --> queryKey
  query --> dataShared
  routeResolution --> ssr
  routeManifest --> ssg
  component --> ssr
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
- `src/runtime/access.ts` is the internal boundary used by runtime, renderer,
  data, and FX implementation paths when they need the default scheduler or
  renderer host. Compatibility globals remain exported from their original
  modules.
- `src/renderer/index.ts` installs the renderer bridge at package startup, which
  lets runtime primitives stay renderer-agnostic.
- `src/boot/index.ts` is the public lifecycle facade. `boot/types.ts` owns boot
  config contracts and `boot/hydration.ts` owns selective hydration DOM helpers.
- `src/router/route.ts` is a facade. `authoring.ts`, `store.ts`,
  `manifest.ts`, `activity.ts`, and `resolution.ts` own the router
  responsibilities that used to live together, while `match.ts` handles
  ranking, segment parsing, and param extraction.
- `src/router/navigate.ts` owns browser navigation orchestration, while
  `navigation-scroll.ts` owns scroll restoration state and history scroll
  persistence.
- `src/data/index.ts` owns the shared query and mutation runtime. `types.ts`
  owns the public and internal data contracts, `query-key.ts` owns scoped key
  serialization, and `shared.ts` owns readable notification and async error
  helpers used by data cells.
- `src/ssr/index.ts` is the stable SSR facade. It reuses the same component
  and route model, but swaps the sink from DOM mutation to synchronous HTML
  serialization.
- `src/ssg/create-static-gen.ts` is an orchestration layer over route expansion,
  SSR rendering, file output, and metadata generation rather than a separate
  rendering engine.

## Related docs

- [Core: Runtime](../core/runtime.md)
- [Core: Rendering](../core/rendering.md)
- [Core: Routing](../core/routing.md)
- [Core: Data](../core/data.md)
- [Runtime reactivity](./runtime-reactivity.md)
- [Renderer pipeline](./renderer-pipeline.md)
- [SSR and SSG pipeline](./ssr-ssg-pipeline.md)
- [Router internals](./router-manifest.md)
