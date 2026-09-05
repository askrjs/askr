# Public compatibility boundary

`src/compatibility/contracts/` owns the published TypeScript contracts. These
declarations originate from the verified `0.2.4` package and include types
reachable through callbacks, state reader maps, JSX, and control metadata.
Their filenames and import names are stable source names. They are maintained
source contracts, not declarations regenerated from the current implementation.
Package builds copy this declaration tree unchanged, preserving public symbol
names, class metadata, and documentation consumed by editors and API tooling.
Implementation declarations and compatibility binding names are not published.

`src/compatibility/entries/` binds each public value to its implementation and
ascribes its published contract. Bindings preserve function, constructor, and
cross-subpath identity and add no function invocation to the ordinary path.
Package JavaScript builds and source consumer tests use these entries. The internal
benchmark entry remains separate.

The ascriptions are an explicit compatibility boundary. They let private owner,
control, and request representations change without redefining consumer types.
Structurally compatible bindings remain checked assignments. Explicit casts are
limited to bindings whose legacy owner or nominal types differ at the boundary.
They do not prove that an implementation satisfies its behavioral contract.
Frozen consumer examples, packed behavior fixtures, declaration snapshots, and
the runtime suites provide that evidence. Do not regenerate contracts or relax
fixtures to conceal an implementation mismatch. Public changes require updating
the contract, behavior, documentation, and consumer evidence together.

## Runtime and renderer wiring

`runtime/runtime-state.ts` owns scheduler and renderer wiring. Execution reads
this internal state through `runtime/access.ts`. The public `AskrRuntime` object
is implemented in `compatibility/runtime.ts`; it retains the existing scheduler,
renderer getter, constructor options, and renderer replacement method.

The process default runtime shares one wiring record with execution. Additional
runtimes keep their own records and retain the existing default scheduler policy.
Constructing a runtime does not invoke an overridden `configureRenderer` method.

`runtime/renderer-capabilities.ts` describes evaluation, cleanup, keyed rendering,
and reactive rendering separately. It has no dependency on public compatibility
types. Browser composition in `boot/runtime-wiring.ts` installs the built-in
renderer capabilities directly. Public runtime views observe a newly installed
renderer lazily and keep that view stable until the next replacement. Native
boot does not load the extension translator merely to mount a root. Published
boot and testing entries install lifetime property views for state reader maps.
Inbound extension operations adopt consumer-created owner records when necessary;
ordinary owners already carry their authoritative lifetime.

Custom hosts enter through `compatibility/renderer.ts`. Calls retain the original
host as `this`, preserve arguments, and observe method replacement. Component,
scope, and readable identities cross this boundary unchanged. Legacy component
lifetime properties are views backed by the runtime ownership record, including
the owner identity shared by callbacks and state reader maps. See
[Runtime ownership](ownership.md) for preparation and disposal semantics.

## Checks

- Declaration snapshots compare overloads, constructors, generic constraints,
  reachable types, and literal values. Quote spelling and declaration aliases
  are normalized; consumer contracts are not changed by that normalization.
- Dependency checks prevent runtime and renderer imports of compatibility
  shapes and prevent published declarations from importing implementations.
- Capability tests cover default replacement, separate runtimes, subclass
  construction, method mutation, callback receivers, and execution without
  browser globals.
- Packed fixtures run the public examples against the candidate installation.
  They can also run against the reference release using
  `npm run test:installed -- /path/to/reference.tgz`.
