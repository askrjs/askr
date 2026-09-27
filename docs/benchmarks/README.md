# Benchmark Index

Askr benchmarks are organized by tier so each lane measures a different layer of the runtime.

## Lanes

| Lane    | Scope                                   | Runtime        |
| ------- | --------------------------------------- | -------------- |
| `tier1` | Hot-path primitives and tight loops     | Node and jsdom |
| `tier2` | Runtime subsystems and shared behaviors | jsdom and Node |

The browser-backed `tier3` and `tier4` lanes were removed in 0.3.0. Evidence
files below that mention them record captures made before that removal.

## What To Run

Use the aggregated script for a local signal check:

```bash
npm run bench
```

Use the lane scripts when you need a narrower capture or a JSON artifact for reporting:

```bash
npm run bench:tier1
npm run bench:tier2
```

Lane runs compile the production hot path. The runtime carries no benchmark
counters, phase timers, or diagnostic wrappers; verify workload shape with DOM
assertions in each benchmark's preflight.

The maintained comparison contract is documented in
[performance targets](./performance-targets.md) and implemented by the tracked
benchmark files selected by the two `vitest.bench.tier*.config.ts` files. Keep
documented workload IDs and labels aligned with those implementations.

## Reading Results

The generated [stability workflow](./stability.md) and [performance targets](./performance-targets.md) docs explain how to use the output.

JSON files contain the raw fields emitted by the benchmark reporter. Provenance
(Node/npm versions, commit and dirty state, runner image, CPU/architecture,
lockfile hash, tier, and file filter) is recorded beside
them. Tail ratios and median-of-three comparisons are derived during analysis;
they are not raw reporter fields. A row is eligible only with at least 10
samples, RME no greater than 15%, and nonzero p75 and p99.

Very short workloads must span enough clock ticks for the 5% guardrail to be
meaningful. Router matching times 128 calls per sample; the workload name
includes that count.
Compare identical blocks, or divide duration percentiles by the count when
reporting per-operation values. Keep single-operation captures as diagnostic
evidence when quantization makes their median unsuitable for qualification.

The lane-specific diagnostics in this repo are intentionally separated so cleanup
cost can be reviewed independently from ordered work loops and ordered DOM
movement paths.

CI benchmark artifacts include the raw JSON and are compared only for the same
benchmark row from three back-to-back captures on the same pinned host.
