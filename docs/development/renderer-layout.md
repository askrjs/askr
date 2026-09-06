# Renderer source layout

`src/renderer` groups DOM implementation modules by the work they perform and
the host state they own. Its top-level files retain the renderer entrypoint,
DOM construction orchestration, host contract, common types, environment access,
and shared utilities.

| Directory         | Responsibility                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `children/`       | Child shapes, bulk updates, reactive children, keyed child views, and static reuse           |
| `component/`      | Component host creation, adoption, retained updates, replacement, cleanup, and result ranges |
| `control/`        | Control-boundary creation, ownership, range adoption, placement, and synchronization         |
| `evaluation/`     | Evaluation dispatch, retained-owner orchestration, and range evaluation                      |
| `for/`            | For commit orchestration, strategies, DOM maps, ranges, moves, and removals                  |
| `hydration/`      | Deferred hydration records, intrinsic adoption, and listener staging                         |
| `intrinsic/`      | Blueprint analysis, materialization, bindings, and element namespaces                        |
| `ownership/`      | Authoritative DOM owner/range indexes, subtree cleanup, and root/element rollback snapshots  |
| `props/`          | Scalar attributes, prop bindings, direct/delegated listeners, and reactive props             |
| `reconciliation/` | Keyed reconciliation, key maps, fast paths, and stable patches                               |

`index.ts` retains the renderer capability factory and integration exports.
`dom.ts` remains the existing facade over `dom-internal.ts`; `dom-host.ts` defines
the internal construction host. Helpers import their owning modules directly;
the directories do not introduce additional barrels or change initialization
order.

Evaluation orchestration remains distinct from keyed reconciliation. Generic
DOM rollback snapshots stay beside the owner and range indexes they restore.
Component replacement and For commit orchestration retain their existing
transaction and lifetime responsibilities.

Published renderer extension contracts remain in the compatibility layer.
Architecture checks traverse nested renderer directories, enforce the central
DOM metadata writer and runtime capability boundaries, and reject value-import
cycles involving runtime or renderer modules.

See the [renderer pipeline](../internals/renderer-pipeline.md),
[renderer ownership](./renderer-ownership.md), and
[runtime source layout](./runtime-layout.md) for the related contracts.
