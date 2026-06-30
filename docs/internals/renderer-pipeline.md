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
  bulk[bulk positional fast paths]
  cleanup[listener and subtree cleanup]

  domNode --> props
  props --> childShape
  childShape --> text
  childShape --> unkeyed
  childShape --> keyed
  keyed --> bulk
  text --> cleanup
  unkeyed --> cleanup
  keyed --> cleanup
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
- `src/renderer/dom.ts` owns element creation, prop syncing, and many fast
  paths.
- `src/renderer/reconcile.ts` and `src/renderer/keyed.ts` handle keyed-child
  reuse and movement decisions.
- `src/renderer/cleanup.ts` owns listener removal and subtree teardown.
- The renderer is deliberately host-shaped so the runtime can stay mostly
  agnostic about DOM details.

## Related docs

- [Core engine design](./core-engine-design.md)
- [Runtime reactivity](./runtime-reactivity.md)
- [Core: Rendering](../core/rendering.md)
