# Internals: Renderer Pipeline

This page documents the DOM-side rendering pipeline in `src/renderer` and the
bridge it uses into the runtime.

## Renderer bridge

The runtime does not hardcode DOM behavior. `src/renderer/index.ts` installs a
renderer host into `src/runtime/runtime.ts`.

```mermaid
flowchart LR
  publicApi[src/index.ts]
  bridge[installRendererBridge()]
  runtime[runtime.ts]
  host[RuntimeRendererHost]
  renderer[renderer evaluate and cleanup methods]

  publicApi --> bridge
  bridge --> runtime
  runtime --> host
  host --> renderer
```

## Evaluation pipeline

`evaluate()` is the central dispatcher. It decides whether a node is text,
element, component, fragment, or control-flow boundary, then routes it to the
right DOM or component path.

```mermaid
flowchart LR
  vnode[JSX or vnode output]
  evaluate[evaluate.ts]
  text[text fast path]
  element[element creation/update]
  component[ComponentInstance execution]
  controls[Show Match For evaluation]
  fragment[fragment or children array]

  vnode --> evaluate
  evaluate --> text
  evaluate --> element
  evaluate --> component
  evaluate --> controls
  evaluate --> fragment
```

## DOM Implementation Ownership

The public renderer entrypoint is intentionally tiny, but the implementation is
not yet fully decomposed. Today the active path routes through
`dom-internal.ts`, which still owns several responsibilities that should become
separate modules.

```mermaid
flowchart TB
  facade[dom.ts facade]
  internal[dom-internal.ts implementation cluster]
  reactive[reactive children and props]
  attributes[attributes.ts scalar props and keys]
  intrinsic[intrinsic element create and prop orchestration]
  componentHost[component host handoff]
  boundaries[boundaries.ts control and For boundary commit]
  staticReuse[static subtree and child-slot reuse]
  reconcile[reconcile.ts keyed orchestration]
  forCommit[for-commit.ts For list DOM commit]
  cleanup[cleanup.ts teardown]

  facade --> internal
  internal --> reactive
  internal --> attributes
  internal --> intrinsic
  internal --> componentHost
  internal --> boundaries
  internal --> staticReuse
  internal --> reconcile
  internal --> forCommit
  internal --> cleanup
```

## Component to DOM handoff

Components do not mutate DOM directly. They produce render output, then hand
that result back to the renderer.

```mermaid
sequenceDiagram
  participant Eval as renderer.evaluate()
  participant Instance as ComponentInstance
  participant Fn as component function
  participant Output as JSX/vnode output
  participant DOM as DOM reconciliation

  Eval->>Instance: run or rerun instance
  Instance->>Fn: execute with props and context
  Fn-->>Instance: render output
  Instance-->>Eval: committed output
  Eval->>DOM: create/update/reconcile subtree
```

## DOM reconciliation

The renderer has multiple commit strategies depending on node shape. Keyed
lists and bulk text updates take specialized paths.

```mermaid
flowchart LR
  domNode[element target]
  props[prop and attr sync]
  childShape[child shape inspection]
  text[text fast path]
  unkeyed[unkeyed child update]
  keyed[keyed reconciliation]
  staticReuse[static subtree reuse]
  bulk[bulk positional fast paths]
  cleanup[listener and subtree cleanup]

  domNode --> props
  props --> childShape
  childShape --> text
  childShape --> unkeyed
  childShape --> keyed
  childShape --> staticReuse
  keyed --> bulk
  text --> cleanup
  unkeyed --> cleanup
  keyed --> cleanup
  staticReuse --> cleanup
```

## Control-flow boundaries

Control primitives are normalized before DOM commit. The runtime computes their
active branch or list state, and the renderer commits the resulting children.

```mermaid
flowchart LR
  controlNode[Show Match For boundary]
  runtimeEval[runtime/control.ts or runtime/for.ts]
  resolved[resolved active children]
  commit[renderer commit path]

  controlNode --> runtimeEval
  runtimeEval --> resolved
  resolved --> commit
```

## Cleanup model

Cleanup is a first-class concern because listener ownership and component-owned
subtrees need precise teardown.

```mermaid
flowchart LR
  subtree[DOM subtree]
  listeners[elementListeners]
  instances[component instances under node]
  teardown[teardownNodeSubtree()]
  cleanup[cleanupInstancesUnder()]

  subtree --> teardown
  subtree --> cleanup
  teardown --> listeners
  cleanup --> instances
```

## Design notes

- `src/renderer/evaluate.ts` is the renderer's dispatcher.
- `src/renderer/dom.ts` is the compatibility facade for the DOM renderer.
  `src/renderer/dom-internal.ts` currently owns the active element creation,
  reactive prop/child handling, component-host handoff, and static-subtree
  reuse implementation.
- `src/renderer/attributes.ts` owns scalar prop writes and removals, including
  class token patching, style string/object/null handling, form `value` and
  `checked`, stale attribute removal, static scalar props, and key
  materialization.
- `src/renderer/boundaries.ts` owns control-boundary state evaluation, direct
  control-boundary detection, commit-owner scheduling, and For/Show/Case
  boundary commit orchestration. It uses an explicit DOM host registered by
  `dom-internal.ts` for DOM operations that would otherwise create an import
  cycle.
- `src/renderer/keyed-children.ts` owns keyed vnode snapshots and DOM key-map
  scans shared by the keyed planner and reconciler.
- `src/renderer/namespaces.ts` owns intrinsic DOM namespace matching used when
  the reconciler decides whether an existing element can be reused.
- `src/renderer/reconcile.ts` and `src/renderer/keyed.ts` handle keyed-child
  reuse, movement planning, and commit orchestration.
- `src/renderer/cleanup.ts` owns listener removal and subtree teardown.
- The renderer is deliberately host-shaped so the runtime can stay mostly
  agnostic about DOM details.

## Architecture Review Notes

The renderer diagrams point to two concrete follow-ups:

- `dom-internal.ts` is still the highest-risk renderer file because it mixes
  reactive child ownership, component host reuse, error boundaries, static
  subtree reuse, and child reconciliation.
- Extracted renderer helpers are now active dependencies. Future splits should
  keep helper modules wired into the running path rather than creating parallel
  implementations.

## Related docs

- [Core engine design](./core-engine-design.md)
- [Runtime reactivity](./runtime-reactivity.md)
- [Core: Rendering](../core/rendering.md)
