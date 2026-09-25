# Runtime ownership

`runtime/ownership/record.ts` owns each lifetime's identity, cancellation signal,
cleanup registrations, child lifetimes, and committed subscriptions. Execution
records hold hook state and render revisions. Async resources and query cells
retain their independent request revisions and existing cache semantics.

Disposal invalidates the lifetime before invoking user code. It drains child
disposal, cleanup callbacks, subscription removal, and cancellation even when
individual steps fail. Repeated or reentrant disposal has no further effect.
Components, control branches, keyed items, portals, resources, watches, and query
attachments use the same lifetime graph. Its iterative postorder drain supports
deep component chains without recursive disposal. Reparenting detaches the exact
lifetime before attaching it to its new owner; a former parent's disposal cannot
retire that retained child. Independent roots and server requests are explicitly
detached from the surrounding execution scope.
Component cleanup collects failures while the lifetime drains. A strict
component (`cleanupStrict`, inherited by descendants, including components
rendered by control-flow child scopes) throws them to its disposer as one
`AggregateError`. An ordinary component reports them through
`reportUncaughtErrorLater` (one error as-is, several as an `AggregateError`),
in every build. Child-scope records themselves stay non-strict, so disposing a
`For` item or branch never throws a descendant's strict failure into the update
that removed it. Renderer teardown (`teardownNodeSubtree`,
`cleanupInstanceIfPresent`, `removeAllListeners`, and the single-element
helpers in `renderer/ownership/cleanup.ts`) collects ref, listener, reactive
binding, and component disposal failures while it drains the whole subtree,
then surfaces them once: strict callers (`{ strict: true }`, used by root
snapshot rollback and by `cleanupStrict` app cleanup) receive a thrown
`AggregateError`; all other callers report them through
`reportUncaughtErrorLater`. A ref binding is retired even when its callback
throws, so a second teardown pass over the same element cannot report it again.
`reportUncaughtErrorLater` queues reports and delivers them in order on the next
microtask, after the render or commit that failed, so error handlers can write
state and cannot interrupt or roll back that work. Every failure reaches
exactly one channel: thrown to a strict caller or reported.
An inactive route detaches its reads
before user cleanup, so departed state cannot schedule its replacement.

Lifecycle callbacks capture the lifetime that invoked them. A returned cleanup
belongs to that lifetime, including when the callback synchronously replaces
the root. Cleanup returned after disposal runs immediately. A captured execution
context keeps its original cancellation signal after replacement or disposal.

`runtime/component/generation.ts` owns root generation preparation, rollback,
and retirement. Navigation retains an opaque prepared generation instead of
copying and resetting private component fields. The host restores its own state
between provisional disposal and execution restoration. The
[renderer](renderer-ownership.md) owns host mutation and range indexes.
The [shared transaction coordinator](commit-protocol.md) publishes prepared
ownership before settling departed lifetimes. Navigation retires the runtime
generation directly; it does not discover descendants by walking DOM metadata.

The compatibility adapter exposes the legacy component properties as views of
the authoritative lifetime. Host callbacks and state reader maps retain the
same component identity. Extension-created records are adopted in place when
passed into the built-in host. Internal consumers use ownership capabilities
and never read the legacy lifetime properties.
The legacy scoped-child `Set` is a maintained index containing labelled scopes,
not ordinary component children. An assigned collection retains its identity,
including live additions and removals during disposal. The adapter translates
those entries into the same lifetime drain. Native rendering does not allocate
this compatibility collection unless an extension observes it.
Active disposal leaves a caller-retained collection intact; inactive generation
retirement clears it before the old generation's cleanup callbacks, preserving
the published extension behavior in both cases.
