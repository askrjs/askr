# Internals: Runtime Extension Boundary

This page collects implementation contracts behind the public runtime boundary
described in [Core: Runtime](../core/runtime.md#runtime-boundary). Application
code does not need them; they matter when you maintain the renderer, the
transaction coordinator, or a custom renderer host.

## Renderer host handles

`createDOMRendererHost(configure)` passes component owners, child scopes, and
reactive sources to host callbacks as frozen, empty opaque handles. A handle's
identity follows the underlying record across rerenders. Native delegates
reject forged, wrong-kind, and foreign-factory handles before any mutation.
Handles add no disposal or generation semantics. Returned ranges expose only
readonly `start`, `end`, and `single` fields.

See [Public implementation boundary](../development/compatibility-boundary.md)
for how custom hosts enter through `renderer/host-adapter.ts`.

## Stable intrinsic patches

Stable intrinsic patches preflight the complete supported tree before applying
anything. A declined patch executes no components and changes no DOM, bindings,
refs, or cleanup. Components, boundaries, fragments, reactive children, and
dangerous HTML use ordinary synchronization. Application errors retain
transaction rollback.

See [Renderer pipeline](./renderer-pipeline.md) for where stable patching sits
in evaluation.

## Commit participants

Participants registered with a commit transaction are keyed by kind and
identity. Re-registering the same object is idempotent; a distinct object with
the same key is a collision and must explicitly keep the first participant or
merge into it. Nested joins validate all collisions before transferring
membership. A throwing merge discards the affected transactions and drains
rollback before propagating the initiating error.

See [Shared commit protocol](../development/commit-protocol.md) for the
transaction phases these participants take part in.
