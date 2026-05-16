# Benchmark Stability Workflow

Askr benchmarks are split into four lanes:

- `tier1`: hot path benchmarks.
- `tier2`: subsystem benchmarks.
- `tier3`: system benchmarks.
- `tier4`: integration benchmarks.

## Stable Lanes

Run the stable non-browser lanes with:

```bash
npm run bench
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier1.bench.config.ts --outputJson bench-results/tier1.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier2.bench.config.ts --outputJson bench-results/tier2.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier3.bench.config.ts --outputJson bench-results/tier3.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier4.bench.config.ts --outputJson bench-results/tier4.json
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier1.bench.config.ts --outputJson bench-results/tier1.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier2.bench.config.ts --outputJson bench-results/tier2.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier3.bench.config.ts --outputJson bench-results/tier3.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier4.bench.config.ts --outputJson bench-results/tier4.json && node scripts/generate-bench-log.js --verify
```

`bench:verify` enforces stability thresholds for tier 1 through tier 4 output:

- max RME: 15%
- min sample count: 10

Override thresholds ad hoc:

```bash
node scripts/generate-bench-log.js --verify --max-rme=12 --min-samples=12
```

## Repeatability Check

Before trusting optimization deltas, run three consecutive captures:

```bash
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier1.bench.config.ts --outputJson bench-results/tier1.json
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier2.bench.config.ts --outputJson bench-results/tier2.json
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier3.bench.config.ts --outputJson bench-results/tier3.json
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier4.bench.config.ts --outputJson bench-results/tier4.json
```

If hotspot medians drift by more than 5%, retry under cleaner machine
conditions before drawing conclusions.

## Practical Run Conditions

- Close non-essential CPU and browser workloads.
- Keep power profile stable.
- Do not run in parallel with test or build jobs.
- Prefer back-to-back runs in the same shell session.
