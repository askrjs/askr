# Benchmark Index

Askr benchmarks are organized by tier so each lane measures a different layer of the runtime.

## Lanes

| Lane    | Scope                                   | Runtime        |
| ------- | --------------------------------------- | -------------- |
| `tier1` | Hot-path primitives and tight loops     | Node           |
| `tier2` | Runtime subsystems and shared behaviors | jsdom and Node |
| `tier3` | System-level browser/runtime behavior   | Chromium       |
| `tier4` | Browser integration scenarios           | Chromium       |

## What To Run

Use the aggregated script for a local signal check:

```bash
npm run bench
```

Use the lane scripts when you need a narrower capture or a JSON artifact for reporting:

```bash
npm run bench:tier1
npm run bench:tier2
npm run bench:tier3
npm run bench:tier4
```

Normal lane runs compile the production hot path without benchmark counters,
phase timers, or diagnostic wrappers. To investigate attribution rather than
capture production timing, opt in explicitly:

```bash
ASKR_BENCH_INSTRUMENTATION=1 npm run bench:tier1
```

The maintained comparison contract is documented in
[performance targets](./performance-targets.md) and implemented by the tracked
benchmark files selected by the four `vitest.bench.tier*.config.ts` files. Keep
documented workload IDs and labels aligned with those implementations.

## Reading Results

The generated [stability workflow](./stability.md) and [performance targets](./performance-targets.md) docs explain how to use the output.

JSON files contain the raw fields emitted by the benchmark reporter. Provenance
(Node/npm versions, commit and dirty state, runner image, CPU/architecture,
Playwright revision, lockfile hash, and instrumentation mode) is recorded beside
them. Tail ratios and median-of-three comparisons are derived during analysis;
they are not raw reporter fields. A row is eligible only with at least 10
samples, RME no greater than 15%, and nonzero p75 and p99.

The lane-specific diagnostics in this repo are intentionally separated so cleanup
cost can be reviewed independently from ordered work loops and ordered DOM
movement paths.

CI benchmark artifacts include the raw JSON and are compared only for the same
benchmark row from three back-to-back captures on the same pinned host.

## External JFB Comparisons

The local `js-framework-benchmark` capture is a separate product-level signal
from the tiered Askr guardrails. For JFB comparisons, keep the framework,
benchmark ID, browser, throttling mode, reset behavior, and iteration count
identical. Report total duration, measured script time, and paint time as separate
columns; a faster script phase does not imply a faster end-to-end row.
Hydration/adoption and deferred activation are separate phases and must not be
collapsed into one root-wide timing.

The keyed movement-density diagnostic uses permutations requiring exactly 200,
500, 1,000, 1,500, and 1,999 moves on a 2,000-row table, with the LIS length
verified independently. Full append/clear teardown is reported
separately so cleanup cost does not get misattributed to the reorder path. The
`tier3-system-table-keyed-movement-density.tsx` diagnostic provides a matching
Chromium workload for the component-boundary keyed reorder subsystem; use it
before treating a jsdom-only result as a browser optimization target. The movement-density
diagnostic is a separate signal from cleanup-time deltas.

The component-boundary reorder diagnostic is
`tier3-system-keyed-lis-component-boundary.tsx`. Use its Chromium result as
the authority for the corresponding jsdom subsystem workload; do not tune the
runtime from a jsdom-only hotspot when the browser workload is materially
different.
