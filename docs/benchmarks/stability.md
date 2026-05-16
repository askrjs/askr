# Benchmark Stability Workflow

The benchmark suite is split into four lanes:

- `tier1`: hot path benchmarks.
- `tier2`: subsystem benchmarks.
- `tier3`: system benchmarks, now browser-backed in Chromium.
- `tier4`: integration benchmarks, browser-backed in Chromium.

Start from the lane index in [Benchmark README](./README.md), then use the lane-specific configs and the generated log to review signal quality.

## Running The Suite

Use the aggregate script for normal local coverage:

```bash
npm run bench
```

Capture all lanes as JSON and generate the consolidated log when you need a reviewable artifact:

```bash
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier1.bench.config.ts --outputJson bench-results/tier1.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier2.bench.config.ts --outputJson bench-results/tier2.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier3.bench.config.ts --outputJson bench-results/tier3.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier4.bench.config.ts --outputJson bench-results/tier4.json && node scripts/generate-bench-log.js --verify
```

The generated [bench-results.log](../../bench-results.log) summarizes hz, mean, p75, p99, p995, p999, tail ratio, RME, and sample count for every numeric benchmark.

`node scripts/generate-bench-log.js --verify` enforces the repo stability thresholds:

- max RME: 15%
- min sample count: 10

Use tighter local thresholds only when you need a stricter gate for a focused investigation:

```bash
node scripts/generate-bench-log.js --verify --max-rme=12 --min-samples=12
```

## Repeatability Check

Before trusting optimization deltas, run three consecutive captures under the same machine conditions:

```bash
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier1.bench.config.ts --outputJson bench-results/tier1.json
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier2.bench.config.ts --outputJson bench-results/tier2.json
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier3.bench.config.ts --outputJson bench-results/tier3.json
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier4.bench.config.ts --outputJson bench-results/tier4.json
```

If hotspot medians drift by more than 5%, retry under cleaner machine conditions before drawing conclusions.

## Practical Conditions

- Close non-essential CPU and browser workloads.
- Keep the power profile stable.
- Do not run in parallel with test or build jobs.
- Prefer back-to-back runs in the same shell session.
