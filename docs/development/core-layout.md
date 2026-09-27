# Core source layout

`src/core` holds the runtime and the DOM renderer. It is split into layers. Each
layer imports only from the layers listed for it, and the core imports nothing
outside `src/common`. `tests/checks/core-architecture.test.ts` enforces the
layering and the absence of import cycles.

| Layer       | Owns                                                                                                                 | May import                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `reactive`  | The owner tree (lifetimes), the reactive graph, and the scheduler                                                    | nothing                         |
| `component` | Component instances, positional hooks, the render journal, and whether a render is executing                         | `reactive`                      |
| `view`      | What a render result means: child descriptors shared by the DOM and SSR renderers                                    | nothing                         |
| `dom`       | The rendered tree (DOM position), render passes, reconciliation, props, events, hydration, roots, updates            | the three above                 |
| `api`       | Public primitives: `state()`, `derive()`, `selector()`, controls, scopes, portals, lifecycle hooks, and the hook kit | `reactive`, `component`, `view` |

Within `dom`, each module has one job:

| Module                                                | Job                                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `tree`                                                | Rendered-node model and DOM position queries                                |
| `pass`                                                | Provisional work: commit or discard                                         |
| `reconcile`                                           | Child lists and the keyed move pass                                         |
| `nodes`                                               | Creating, patching, and releasing each node kind                            |
| `props`                                               | Whether a prop is a value, handler, ref, or binding, and when it is written |
| `prop-values`, `dom-properties`, `element-attributes` | How a value is written                                                      |
| `events`                                              | Delegated and direct event listeners                                        |
| `hydration`                                           | Claiming server markup with a cursor                                        |
| `refs`, `teardown`                                    | Ref assignment and post-update teardown error reporting                     |
| `updates`                                             | Standalone re-renders and error routing                                     |
| `root`                                                | Rendering into a container and owning what it renders                       |

The component layer reaches the renderer only through the `RenderHost`
interface, and `nodes` reaches standalone updates through an injected
scheduler, so no layer depends on a concrete layer above it.

Subsystems outside the core (`boot`, `router`, `ssr`, `ssg`, `data`,
`resources`, `foundations`) mostly import `src/core/api`. Boot renders through
`src/core/dom/root`, and some integrations reach the scheduler or owner tree
directly. `tests/checks/architecture.test.ts` keeps those subsystems
free of value-import cycles, keeps the core independent of `boot`, `router`,
`ssr`, and `ssg`, and keeps server rendering off `src/core/dom`.

Published declarations live in `src/public-contracts/`, not in these modules.
See the [public implementation boundary](./compatibility-boundary.md).

See [runtime reactivity](../internals/runtime-reactivity.md) and the
[renderer pipeline](../internals/renderer-pipeline.md) for the behavior behind
this layout, and [Core rewrite](../internals/core-rewrite.md) for the design
record.
