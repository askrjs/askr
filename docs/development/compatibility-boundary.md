# Public implementation boundary

`src/public-contracts/` owns the published TypeScript contracts. These
declarations include types reachable through callbacks, state reader maps, JSX,
and control metadata. Their filenames and import names are stable source names
and are checked directly against the implementation. Package builds copy this
declaration tree unchanged, preserving public symbol names, class metadata, and
documentation consumed by editors and API tooling.

Public entrypoints bind directly to their implementations. Package JavaScript
builds and source consumer tests use those direct entrypoints; the internal
benchmark entry remains separate.

The public contracts are an explicit boundary around private owner, control, and
request representations. Frozen consumer examples, packed behavior fixtures,
declaration snapshots, and the runtime suites provide behavioral evidence.
Public changes require updating the contract, behavior, documentation, and
consumer evidence together.

## Checks

- Declaration snapshots compare overloads, constructors, generic constraints,
  reachable types, and literal values. Quote spelling and declaration aliases
  are normalized; consumer contracts are not changed by that normalization.
- Dependency checks prevent published declarations from importing implementations.
- Packed fixtures run the public examples against the candidate installation.
  They can also run against the reference release using
  `npm run test:installed -- /path/to/reference.tgz`.
