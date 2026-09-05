# Runtime ownership

`runtime/ownership.ts` owns each lifetime's identity, cancellation signal,
cleanup registrations, child scopes, and committed subscriptions. Execution
records hold hook state and render revisions. Async resources and query cells
retain their independent request revisions and existing cache semantics.

Disposal invalidates the lifetime before invoking user code. It drains child
disposal, cleanup callbacks, subscription removal, and cancellation even when
individual steps fail. Repeated or reentrant disposal has no further effect.
Strict component cleanup aggregates failures after disposal; ordinary cleanup
retains the development warning behavior. An inactive route detaches its reads
before user cleanup, so departed state cannot schedule its replacement.

Lifecycle callbacks capture the lifetime that invoked them. A returned cleanup
belongs to that lifetime, including when the callback synchronously replaces
the root. Cleanup returned after disposal runs immediately. A captured execution
context keeps its original cancellation signal after replacement or disposal.

`runtime/component-generation.ts` owns root generation preparation, rollback,
and retirement. Navigation retains an opaque prepared generation instead of
copying and resetting private component fields. The host restores its own state
between provisional disposal and execution restoration. The
[renderer](renderer-ownership.md) owns host mutation and range indexes.
Transaction consolidation remains a subsequent stage of the core series.

The compatibility adapter exposes the legacy component properties as views of
the authoritative lifetime. Host callbacks and state reader maps retain the
same component identity. Extension-created records are adopted in place when
passed into the built-in host. Internal consumers use ownership capabilities
and never read the legacy lifetime properties.
