# Renderer ownership

Runtime execution uses the capabilities in `runtime/renderer-capabilities.ts`.
It does not read browser globals, inspect nodes, or mutate the DOM. The browser
renderer applies scheduled output, classifies DOM fast paths, manages delegated
events, detaches portal output, and captures and restores child-scope host state.
Resource activity helpers own document visibility, focus, and deferred browser
listener targets; their existing server defaults remain unchanged.

`renderer/ownership/ranges.ts` owns range registration. An owner moving to another
range releases its old anchor indexes. Clearing an obsolete range cannot remove
a newer registration at the same anchors. Explicit range ownership transfers
remain distinct from components sharing a host: wrapper components resolve to
the same active range through a host index, without transferring the range's
primary owner. Singleton ranges are materialized when first queried.
Native component and child-scope records retain a direct range index; opaque
extension owners use an external index. Both are maintained by the same
registry. Public evaluation contexts have private owners in that registry, so
context objects remain untouched and do not introduce a second range model.

`renderer/ownership/nodes.ts` is the writer for component metadata on nodes and
the corresponding host indexes. Updates and restoration retain primary-owner
ordering and the presence of legacy metadata properties. A pending host-pruning
operation cannot redirect a component that hydration has already moved to
fragment anchors. `renderer/ownership/scope-host.ts` writes child-scope range indexes and
owns text restoration and removed-boundary traversal.
Replacement bindings update their range indexes together, including portal
placeholders. Generation rollback restores an opaque renderer snapshot after
the runtime has restored the surviving owner, so provisional disposal cannot
erase the previous generation's host index.

`renderer/ownership/retained-element.ts` captures shallow rollback records before
element updates. Snapshot collections are read-only during restoration. Empty
collections share one frozen value; populated collections retain independent
copies of attributes, child nodes, listeners, and reactive bindings. Form-control
and text capture retain their ordering, including changes made by control getters.

The public renderer extension contracts remain unchanged. The compatibility
adapter supplies renderer-owned application helpers around existing host
callbacks, preserving receivers, argument lists, and method replacement.
An unconfigured runtime can execute components and dispose opaque extension
references without a browser renderer.

Dependency and syntax checks enforce the runtime's platform boundary and the
single host-metadata writer. Behavioral tests cover range transfer, stale-range
retirement, shared wrappers, retained identity, cleanup failures, portal output,
and hydration adoption. The [shared commit protocol](./commit-protocol.md)
coordinates application, restoration, and post-commit retirement.
