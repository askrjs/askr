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
  participant Scheduler as Scheduler lanes
  participant Derived as derive flush
  participant Component as Component instance
  participant Renderer as renderer.evaluate()
  participant DOM as DOM subtree

  Event->>State: write next value
  State->>Readable: mark derived subscribers dirty
  State->>Readable: mark reactive props dirty
  State->>Scheduler: notify readable readers
  Scheduler->>Derived: flush derived lane
  Derived->>Readable: recompute dirty derived cells
  Derived->>Scheduler: enqueue downstream readers if value changed
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

  state --> readable
  derive --> readable
  readable --> component
  readable --> reactiveProps
  readable --> scheduler
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
  dataRuntime[DataRuntime]
  cache[Query cache by key]
  consistency[Consistency state<br/>fresh stale refreshing pending-write]
  invalidate[invalidate prefix listeners]
  readers[component readers]

  queryCall --> dataRuntime
  dataRuntime --> cache
  cache --> consistency
  invalidate --> cache
  consistency --> readers
```

## Design notes

- `src/runtime/component.ts` is the main ownership and lifecycle file.
- `src/runtime/state.ts` stores component-local writable cells.
- `src/runtime/derive.ts` tracks dependency reads and recomputes in the
  scheduler's `derived` lane.
- `src/runtime/readable.ts` is the shared substrate connecting state, derived
  values, reactive props, and component readers.
- `src/runtime/resource-cell.ts` is intentionally component-agnostic. The
  component binding lives in `src/runtime/operations.ts`.
- `src/data/index.ts` provides a separate keyed cache runtime for app data and
  eventual-consistency workflows.

## Related docs

- [Core engine design](./core-engine-design.md)
- [Core: Data](../core/data.md)
- [Concepts: Determinism](../concepts/determinism.md)
