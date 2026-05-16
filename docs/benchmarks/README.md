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

Use the aggregated script for normal local checks:

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

For release-style review, capture JSON and generate the consolidated report:

```bash
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier1.config.ts --outputJson bench-results/tier1.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier2.config.ts --outputJson bench-results/tier2.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier3.config.ts --outputJson bench-results/tier3.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier4.config.ts --outputJson bench-results/tier4.json && node scripts/generate-bench-log.js --verify
```

## Reading Results

The generated [stability workflow](./stability.md) and [performance targets](./performance-targets.md) docs explain how to use the output.

The consolidated [bench-results.log](../../bench-results.log) includes hz, mean, p75, p99, p995, p999, tail ratio, RME, and sample count for each numeric benchmark, plus a stability summary that highlights noisy lanes and wide tails.
