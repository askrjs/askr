# Benchmark Stability Workflow

The benchmark suite is split into four lanes:

- `tier1`: hot path benchmarks.
- `tier2`: subsystem benchmarks.
- `tier3`: system benchmarks, now browser-backed in Chromium.
- `tier4`: integration benchmarks, browser-backed in Chromium.

Start from the lane index in [Benchmark README](./README.md), then use the lane-specific configs and result artifacts to review signal quality.

## Running The Suite

Use the aggregate script for normal local coverage:

```bash
npm run bench
```

Capture all lanes as JSON when you need a reviewable artifact:

```bash
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier1.config.ts --outputJson bench-results/tier1.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier2.config.ts --outputJson bench-results/tier2.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier3.config.ts --outputJson bench-results/tier3.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier4.config.ts --outputJson bench-results/tier4.json
```

The generated lane JSON files summarize hz, mean, p75, p99, p995, p999, tail ratio,
RME, and sample count for every numeric benchmark. For stability review, compare
same-host captures and treat variance, wide tails, and timer-resolution edges as
signals to re-run and investigate before tuning.

## Repeatability Check

Before trusting optimization deltas, run three consecutive captures under the same machine conditions:

```bash
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier1.config.ts --outputJson bench-results/tier1.json
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier2.config.ts --outputJson bench-results/tier2.json
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier3.config.ts --outputJson bench-results/tier3.json
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.bench.tier4.config.ts --outputJson bench-results/tier4.json
```

If hotspot medians drift by more than 5%, retry under cleaner machine conditions before drawing conclusions. Do not compare local output to a CI capture or compare renamed/changed workloads; use the matching raw JSON row and environment metadata.

## Practical Conditions

- Close non-essential CPU and browser workloads.
- Keep the power profile stable.
- Do not run in parallel with test or build jobs.
- Prefer back-to-back runs in the same shell session.
