# Internals: Runtime Reactivity

This page focuses on the reactive core in `src/runtime` and `src/data`.
The goal is to show how state, derived values, component instances, resources,
and the shared data runtime interact.

## Reactive update pipeline

The runtime is intentionally serialized. Writes do not mutate the DOM directly;
they dirty sources, enqueue work, and let the scheduler flush in a deterministic
order.

```mermaid
sequenceDiagram
  participant Event as Event handler / async callback
  participant State as state.set()
  participant Readable as readable graph
  participant Access as runtime/access.ts
  participant Scheduler as Scheduler lanes
  participant Derived as derive flush
  participant Component as Component instance
  participant Renderer as renderer.evaluate()
  participant DOM as DOM subtree

  Event->>State: write next value
  State->>Readable: mark derived subscribers dirty
  State->>Readable: mark reactive props dirty
  State->>Access: notify readable readers
  Access->>Scheduler: enqueue reader task
  Scheduler->>Derived: flush derived lane
  Derived->>Readable: recompute dirty derived cells
  Derived->>Access: enqueue downstream readers if value changed
  Access->>Scheduler: enqueue task
  Scheduler->>Component: run component lane task
  Component->>Renderer: evaluate new render output
  Renderer->>DOM: reconcile keyed/unkeyed children
  Scheduler->>Component: run post-commit lifecycle work
```

## Runtime ownership model

`ComponentInstance` is the runtime's ownership boundary. Hook state, cleanup,
abort semantics, and readable subscriptions all hang off the instance.

```mermaid
flowchart LR
  instance[ComponentInstance]
  props[props]
  hooks[stateValues and lifecycleSlots]
  cleanup[cleanupFns]
  mount[mountOperations and commitOperations]
  abort[AbortController]
  owner[ownerFrame context chain]
  reads[last committed readable subscriptions]
  updates[notifyUpdate and pending run task]

  instance --> props
  instance --> hooks
  instance --> cleanup
  instance --> mount
  instance --> abort
  instance --> owner
  instance --> reads
  instance --> updates
```

## Component and For Implementation Ownership

The runtime public import paths remain stable while their active
implementations live behind facades. `For` item scopes depend on component hook
indexing and child-scope ownership, so that relationship should stay explicit
when the implementation is split further.

```mermaid
flowchart TB
  componentFacade[component.ts facade]
  componentCore[component-internal.ts]
  current[current instance and portal scope]
  lifecycle[lifecycle commit batching]
  render[render execution and inline snapshots]
  hooks[hook index claiming]
  cleanup[component cleanup and owned child scopes]

  forFacade[for.ts facade]
  forCore[for-internal.ts]
  forState[ForState and item instances]
  itemSignals[item, index, and property signals]
  reconcile[reconcileForItems strategy]
  fallback[fallback and item disposal]

  componentFacade --> componentCore
  componentCore --> current
  componentCore --> lifecycle
  componentCore --> render
  componentCore --> hooks
  componentCore --> cleanup
  forFacade --> forCore
  forCore --> forState
  forCore --> itemSignals
  forCore --> reconcile
  forCore --> fallback
  forCore --> componentFacade
```

## Readable graph

State and derived values are two kinds of readable source feeding the same
dependency graph.

```mermaid
flowchart LR
  state[state()]
  derive[derive()]
  readable[ReadableSource graph]
  component[Component render readers]
  reactiveProps[reactive prop dirtiness]
  scheduler[Scheduler]
  access[runtime/access.ts]

  state --> readable
  derive --> readable
  readable --> component
  readable --> reactiveProps
  readable --> access
  access --> scheduler
```

## Scheduler lanes

The scheduler enforces flush order explicitly. Derived work settles before
component rerenders, and post-commit work runs after DOM evaluation.

```mermaid
flowchart LR
  enqueue[enqueue task]
  derived[derived lane]
  component[component lane]
  reactive[reactive lane]
  post[post lane]
  flush[flush loop]

  enqueue --> flush
  flush --> derived
  derived --> component
  component --> reactive
  reactive --> post
```

## Lifecycle-bound async resources

`resource()` is a component-scoped async primitive. It wraps async work in a
`ResourceCell`, ties cancellation to component lifecycle, and exposes a stable
snapshot object.

```mermaid
flowchart LR
  component[Component render]
  resourceHook[resource() in runtime/operations.ts]
  cell[ResourceCell]
  abort[AbortController]
  loader[loader fn with signal]
  snapshot[snapshot value pending error refresh]
  rerender[subscriber-triggered rerender]

  component --> resourceHook
  resourceHook --> cell
  cell --> abort
  cell --> loader
  loader --> snapshot
  cell --> snapshot
  snapshot --> rerender
```

## Shared query and mutation runtime

The data layer is separate from `resource()`. It is keyed, shared, and cache
oriented rather than purely lifecycle oriented.

```mermaid
flowchart LR
  queryCall[createQuery or createMutation]
  dataTypes[data/types.ts contracts]
  queryKey[data/query-key.ts scoped keys]
  dataRuntime[DataRuntime]
  cache[Query cache by key]
  consistency[Consistency state<br/>fresh stale refreshing pending-write]
  invalidate[invalidate prefix listeners]
  readers[component readers]

  queryCall --> dataRuntime
  queryCall --> dataTypes
  queryCall --> queryKey
  dataRuntime --> cache
  cache --> consistency
  invalidate --> cache
  consistency --> readers
```

## Design notes

- `src/runtime/component.ts` is the compatibility facade for the component
  runtime. `src/runtime/component-internal.ts` currently owns instance
  creation, current-instance state, lifecycle batching, render execution, hook
  index claiming, cleanup, and owned child scopes.
- `src/runtime/for.ts` is the compatibility facade for `For` runtime state.
  `src/runtime/for-internal.ts` currently owns item signals, key validation,
  per-item creation/update/disposal, fallback handling, and array
  reconciliation.
- `src/runtime/state.ts` stores component-local writable cells.
- `src/runtime/derive.ts` tracks dependency reads and recomputes in the
  scheduler's `derived` lane.
- `src/runtime/readable.ts` is the shared substrate connecting state, derived
  values, reactive props, and component readers.
- `src/runtime/access.ts` is the internal boundary for default scheduler and
  renderer-host access used by runtime, renderer, data, and FX hot paths.
- `src/runtime/resource-cell.ts` is intentionally component-agnostic. The
  component binding lives in `src/runtime/operations.ts`.
- `src/data/index.ts` provides the keyed cache runtime for app data and
  eventual-consistency workflows. `src/data/types.ts` holds the public and
  internal contracts, `src/data/query-key.ts` owns `queryScope()` key
  serialization, and `src/data/shared.ts` owns readable notification and async
  error helpers shared by query and mutation cells.

## Architecture Review Notes

The runtime diagrams expose two follow-ups:

- Component lifecycle and `For` reconciliation are still large implementation
  clusters. The next cleanup should split by ownership rather than only by
  import facade.
- `For` depends on component hook indexing and child-scope cleanup. That
  coupling is legitimate, but it needs explicit contract modules so future
  splits do not reach back into component internals.

## Related docs

- [Core engine design](./core-engine-design.md)
- [Core: Data](../core/data.md)
- [Concepts: Determinism](../concepts/determinism.md)
