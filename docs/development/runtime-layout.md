# Runtime source layout

`src/runtime` groups implementation modules by the state and behavior they own.
The top-level files contain the internal entrypoint, operations facade, scheduler,
execution-model policy, and renderer/runtime wiring.

| Directory       | Responsibility                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `component/`    | Component records, execution scopes, generations, commit, cleanup, snapshots, and error boundaries |
| `context/`      | Context frames and host-independent vnode context propagation                                      |
| `control/`      | Show/Case branches and For state, reconciliation, item scopes, and signals                         |
| `diagnostics/`  | Development namespaces, ownership/read diagnostics, and performance counters                       |
| `lifecycle/`    | Owned listeners, tasks, timers, watches, resources, streams, and settlement                        |
| `ownership/`    | Lifetime records, cancellation, disposal, and owned child scopes                                   |
| `portal/`       | Default, explicit, and server portal behavior and shared lifetime handling                         |
| `reactivity/`   | Writable and derived state, readable subscriptions, selectors, effects, and snapshot branding      |
| `transactions/` | Commit coordination, current-transaction access, and render publication/rollback                   |

`index.ts` remains the internal integration surface used by other subsystems.
The architecture checks also allow specific component, ownership, and transaction
capability modules where an integration needs a narrower surface. Runtime helpers
import the concrete module that owns a capability; grouping does not add another
layer of re-export barrels or change module initialization order.

`access.ts` resolves the active renderer capabilities and default scheduler.
`runtime-state.ts` owns their wiring, `renderer-capabilities.ts` defines the host
contract, and `scheduler.ts` owns the drain phase, queues, and flush epochs.
`scheduler-scopes.ts` owns nested handler/progress permissions.
`operations.ts` collects lifecycle
primitives; `execution-model.ts` enforces the selected execution model.

Scheduler kicks check execution permissions both when scheduled and when their
microtask runs. A kick queued before a handler starts waits until that handler
is released. The compatibility `setInHandler` flag is independent of lexical
`runInHandlerScope` nesting; clearing the flag cannot release an active scope.
Explicit synchronous handler flushing still occurs when the outer handler exits.

`runWithSyncProgress` restores its enclosing permissions on success or failure.
If its callback throws with queued work, that work receives a deferred kick once
execution permits it; the callback's error still propagates. Bulk-commit admission
rules and derived/component/reactive/post lane order are unchanged.

An active flush owns its completion epoch, including nested progress scopes and
queue clearing. Empty nested progress scopes do not advance the version before
their outer scope exits, and clearing during a flush does not schedule an extra
epoch. A standalone empty progress scope still advances the version. Flush
waiters observe completed epochs, rather than scope entry or queued work.

These directories are internal implementation paths. Published package entrypoints
and maintained declarations remain in the compatibility layer. Architecture tests
traverse the nested directories, enforce the existing capability boundaries, and
reject runtime/renderer value-import cycles.

See [core engine design](../internals/core-engine-design.md),
[ownership](./ownership.md), and [commit protocol](./commit-protocol.md) for the
behavioral contracts behind this layout.
