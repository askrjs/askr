# Internals: Core Engine Design

This page documents the current `askr` core engine shape from the source tree.
It is intended as a design map for contributors, not as API-first user docs.

The diagrams below reflect the current boundaries in `src/runtime`, `src/renderer`,
`src/router`, `src/ssr`, `src/ssg`, and `src/data`.

## 1. Big picture

This first diagram is the system view: how application code flows into the
reactive runtime, then out through routing, DOM rendering, and server-side
rendering pipelines.

```mermaid
flowchart TB
  app[Application code<br/>components, state, routes]
  publicApi[Public API surface<br/>src/index.ts, router, data, ssr, ssg]

  subgraph engine[Core engine]
    runtime[Runtime core<br/>component.ts, state.ts, derive.ts, context.ts]
    scheduler[Scheduler<br/>derived, component, reactive, post lanes]
    rendererBridge[Renderer bridge<br/>runtime.ts <-> renderer/index.ts]
    routerManifest[Route manifest<br/>route.ts and match.ts]
    asyncData[Async data<br/>resource-cell.ts and data/index.ts]
  end

  subgraph outputs[Outputs]
    dom[DOM renderer<br/>evaluate.ts, dom.ts, reconcile.ts]
    spa[SPA navigation]
    ssr[SSR HTML rendering]
    ssg[SSG batch generation]
  end

  app --> publicApi
  publicApi --> runtime
  publicApi --> routerManifest
  publicApi --> asyncData
  runtime --> scheduler
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
  end

  subgraph render[DOM renderer]
    bridge[renderer/index.ts bridge]
    evaluate[evaluate.ts]
    dom[dom.ts]
    reconcile[reconcile and keyed fast paths]
    cleanup[cleanup.ts]
  end

  subgraph route[Routing]
    routeReg[route.ts registry and manifest]
    match[match.ts path ranking and params]
    nav[navigate.ts]
  end

  subgraph dataLayer[Async data]
    resource[resource-cell.ts]
    query[data/index.ts query and mutation runtime]
  end

  subgraph server[Server outputs]
    ssr[ssr/index.ts]
    ssg[ssg/create-static-gen.ts]
  end

  app --> api
  api --> state
  api --> derive
  api --> context
  api --> runtime
  runtime --> scheduler
  state --> readable
  derive --> readable
  component --> readable
  component --> scheduler
  api --> bridge
  bridge --> runtime
  bridge --> evaluate
  evaluate --> dom
  evaluate --> reconcile
  evaluate --> component
  reconcile --> cleanup
  api --> routeReg
  routeReg --> match
  nav --> routeReg
  api --> resource
  api --> query
  routeReg --> ssr
  routeReg --> ssg
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
- `src/renderer/index.ts` installs the renderer bridge at package startup, which
  lets runtime primitives stay renderer-agnostic.
- `src/router/route.ts` builds one normalized manifest, while `src/router/match.ts`
  handles ranking, segment parsing, and param extraction.
- `src/ssr/index.ts` reuses the same component and route model, but swaps the
  sink from DOM mutation to synchronous HTML serialization.
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
