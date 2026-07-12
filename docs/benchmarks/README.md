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

Use the aggregated script for a local signal check. It validates benchmark
lifecycle declarations before running any lane:

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

The stable comparison surface is declared in
[`benchmarks/guardrails.json`](../../benchmarks/guardrails.json). Run
`npm run test:bench-contract` before a capture; it verifies that every
documented guardrail still names a runnable benchmark and an unchanged
workload label.

For release-style review, capture JSON and generate the consolidated report:

```bash
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier1.config.ts --outputJson bench-results/tier1.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier2.config.ts --outputJson bench-results/tier2.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier3.config.ts --outputJson bench-results/tier3.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier4.config.ts --outputJson bench-results/tier4.json && node scripts/capture-bench-metadata.mjs --tier=all --repeat=1 --raw=bench-results/tier1.json,bench-results/tier2.json,bench-results/tier3.json,bench-results/tier4.json && node scripts/generate-bench-log.js --verify
```

## Reading Results

The generated [stability workflow](./stability.md) and [performance targets](./performance-targets.md) docs explain how to use the output.

The consolidated [bench-results.log](../../bench-results.log) includes hz, mean, p75, p99, p995, p999, tail ratio, RME, and sample count for each numeric benchmark, plus a stability summary that highlights noisy lanes, wide tails, and timer-resolution failures. Browser operations with a zero p75 or p99 must be batched before they can guide tuning.

CI benchmark artifacts include the raw JSON and metadata for the commit, runner
image, OS, architecture, CPU, Node version, and the actual Chromium version and
revision obtained by launching Playwright. Compare only the same benchmark row
from three back-to-back captures on the same pinned host.

## External JFB Comparisons

The local `js-framework-benchmark` capture is a separate product-level signal
from the tiered Askr guardrails. For JFB comparisons, keep the framework,
benchmark ID, browser, throttling mode, reset behavior, and iteration count
identical. Report total duration, measured script time, and paint time as
separate columns; a faster script phase does not imply a faster end-to-end row.
Hydration/adoption and deferred activation are separate phases and must not be
collapsed into one root-wide timing.

The keyed movement-density diagnostic sweeps 10%, 25%, 50%, 75%, and 100%
movement on a 2,000-row table. Full append/clear teardown is reported
separately so cleanup cost does not get misattributed to the reorder path.
