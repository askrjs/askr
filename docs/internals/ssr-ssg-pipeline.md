# Internals: SSR and SSG Pipeline

This page documents the server output path in `src/ssr` and `src/ssg`.

## Shared model

SSR and SSG reuse the same route model and the same component semantics. The
main difference is the sink and the orchestration around the render.

```mermaid
flowchart TB
  routes[Route registry or flat routes]
  components[Component tree]
  routeResolve[Route resolution]
  ssrRender[SSR render pipeline]
  html[HTML output]
  ssgBatch[SSG batch orchestration]
  files[static files and metadata]

  routes --> routeResolve
  components --> ssrRender
  routeResolve --> ssrRender
  ssrRender --> html
  ssgBatch --> ssrRender
  ssgBatch --> files
```

## SSR request flow

`renderToString()` and related helpers resolve a route, create request-local
render context, and synchronously serialize HTML.

```mermaid
flowchart LR
  url[request URL]
  routeResolve[route resolution]
  ssrContext[SSR render context]
  facade[ssr/index.ts facade]
  routeRender[route-render.ts route/document orchestration]
  internal[index-internal.ts]
  boundaries[boundaries.ts boundary helpers]
  componentInstance[temp component instances]
  syncRender[sync component render]
  attrs[attr escaping and serialization]
  verify[hydration verification helpers]
  html[HTML string or stream]
  hydrateData[serialized hydration data]

  url --> routeResolve
  routeResolve --> facade
  facade --> routeRender
  routeRender --> ssrContext
  routeRender --> internal
  internal --> boundaries
  internal --> componentInstance
  componentInstance --> syncRender
  syncRender --> attrs
  syncRender --> verify
  attrs --> html
  syncRender --> hydrateData
```

## SSR Implementation Ownership

`src/ssr/index.ts` preserves the public entrypoint. The active implementation
is split between route/document orchestration in `route-render.ts` and
synchronous component execution in `component-runtime.ts`. `index-internal.ts`
keeps synchronous node serialization. `boundaries.ts` owns error/control
boundary state helpers, renderable child normalization, and default fallback
construction. Helper modules own escaping, attributes, sinks, render context,
resolved-route rendering, and hydration verification.

```mermaid
flowchart TB
  facade[index.ts facade]
  routeRender[route-render.ts]
  internal[index-internal.ts]
  boundaries[boundaries.ts]
  componentRuntime[component-runtime.ts]
  serialize[renderable and node serialization]
  controls[error and control boundary state/fallback helpers]
  components[component execution for sync SSR]
  hydration[hydration data and verification]
  routes[route source and document orchestration]
  sinks[string and stream sinks]
  helpers[attrs, escape, context, render-resolved]

  facade --> internal
  internal --> routeRender
  internal --> componentRuntime
  internal --> boundaries
  internal --> serialize
  boundaries --> controls
  componentRuntime --> components
  internal --> hydration
  routeRender --> routes
  routeRender --> sinks
  internal --> helpers
```

## SSR execution constraints

The current SSR implementation is synchronous. Async components, async
`resource()` work, and async document renderers are rejected because awaiting
during render would break deterministic hydration output. Request handlers may
perform async work before rendering, but the render phase itself does not await.

```mermaid
flowchart LR
  render[SSR render]
  sync[synchronous renderable]
  async[async component or async resource]
  ok[serialize HTML]
  fail[throw SSR data missing or async error]

  render --> sync
  render --> async
  sync --> ok
  async --> fail
```

## SSG generation flow

SSG wraps SSR with route expansion, batching, file writes, and metadata.
`entries()` may be async because it runs before rendering; each concrete page
still renders through the synchronous SSR engine.

```mermaid
flowchart LR
  registry[Route registry or route configs]
  normalize[normalize static route configs]
  expand[entries expansion and path interpolation]
  filter[skip runtime-only routes]
  render[batch SSR render]
  write[write static HTML files]
  metadata[metadata.json and incremental manifest]

  registry --> normalize
  normalize --> expand
  expand --> filter
  filter --> render
  render --> write
  render --> metadata
```

## Route expansion for SSG

Parameterized routes become concrete output paths through `entries()`.

```mermaid
flowchart LR
  routeTemplate[/posts/{slug}]
  entries[entries() -> param maps]
  interpolate[interpolateRoutePath()]
  outputs[/posts/a and /posts/b]

  routeTemplate --> entries
  entries --> interpolate
  interpolate --> outputs
```

## Incremental output model

SSG can compare current renders with the incremental manifest to decide what was
written and to preserve metadata across runs.

```mermaid
flowchart LR
  previous[previous incremental manifest]
  current[current route render result]
  hash[hashHtml()]
  compare[compare hash and output metadata]
  write[write file or skip]
  manifest[next incremental manifest]

  previous --> compare
  current --> hash
  hash --> compare
  compare --> write
  compare --> manifest
```

## Design notes

- `src/ssr/index.ts` is the stable SSR facade. `src/ssr/index-internal.ts`
  keeps synchronous HTML serialization, hydration data, and component-form
  `renderToString()`. `src/ssr/boundaries.ts` owns error/control boundary
  state helpers, renderable child normalization, and default fallback
  construction. `src/ssr/component-runtime.ts` owns synchronous component
  execution, strict-purity guards, temporary owner cleanup, and default portal
  wrapping.
- `src/ssr/route-render.ts` owns object-form `renderToString()`,
  `renderToStream()`, route source normalization, route match resolution,
  `resolveRequest()`, document render argument construction, and string/stream
  sink orchestration.
- `src/ssr/create-ssr.ts` wraps that path into a request-oriented API.
- `src/ssg/create-static-gen.ts` is the top-level SSG orchestrator.
- SSG is not a separate renderer; it is route expansion plus repeated
  synchronous SSR.
- Both modes depend on `src/router/resolution.ts` and the normalized route
  model rather than a second routing implementation.

## Architecture Review Notes

The SSR and SSG diagrams expose two follow-ups:

- `index-internal.ts` still mixes string/sink serialization and hydration data.
  Route/document orchestration, boundary state helpers, and component execution
  have been split to `route-render.ts`, `boundaries.ts`, and
  `component-runtime.ts`, but the synchronous renderer remains a responsibility
  cluster.
- SSG should remain an orchestration layer over route expansion and repeated
  synchronous SSR. Any new data-loading work belongs before render, not inside
  the SSR render phase.

## Related docs

- [Core engine design](./core-engine-design.md)
- [Router internals](./router-manifest.md)
- [Core: Rendering](../core/rendering.md)
