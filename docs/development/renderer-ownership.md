# Renderer ownership

Runtime execution uses the capabilities in `runtime/renderer-capabilities.ts`.
It does not read browser globals, inspect nodes, or mutate the DOM. The browser
renderer applies scheduled output, classifies DOM fast paths, manages delegated
events, detaches portal output, and captures and restores child-scope host state.
Resource activity helpers own document visibility, focus, and deferred browser
listener targets; their existing server defaults remain unchanged.

`renderer/dom-range.ts` owns range registration. An owner moving to another
range releases its old anchor indexes. Clearing an obsolete range cannot remove
a newer registration at the same anchors. Explicit range ownership transfers
remain distinct from components sharing a host: wrapper components resolve to
the same active range through a host index, without transferring the range's
primary owner. Singleton ranges are materialized when first queried.

`renderer/dom-ownership.ts` is the writer for component metadata on nodes and
the corresponding host indexes. Updates and restoration retain primary-owner
ordering and the presence of legacy metadata properties. A pending host-pruning
operation cannot redirect a component that hydration has already moved to
fragment anchors. `renderer/scope-host.ts` writes child-scope range indexes and
owns text restoration and removed-boundary traversal.

The public renderer extension contracts remain unchanged. The compatibility
adapter supplies renderer-owned application helpers around existing host
callbacks, preserving receivers, argument lists, and method replacement.
An unconfigured runtime can execute components and dispose opaque extension
references without a browser renderer.

Dependency and syntax checks enforce the runtime's platform boundary and the
single host-metadata writer. Behavioral tests cover range transfer, stale-range
retirement, shared wrappers, retained identity, cleanup failures, portal output,
and hydration adoption. Existing transaction settlement is preserved in this
stage; the next stage consolidates its preparation and recovery protocol.
