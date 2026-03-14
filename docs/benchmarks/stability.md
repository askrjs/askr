# Benchmark Stability Workflow

Use this workflow to stabilize benchmark signal quality before optimization work.

## Goals

- Reduce noisy benchmark output.
- Detect unstable runs automatically.
- Optimize only after stability gates pass.

## Baseline Commands

1. Generate benchmark JSON and summary log.

```bash
npm run bench:json
```

2. Enforce stability thresholds.

```bash
npm run bench:verify
```

`bench:verify` currently enforces:

- max RME: 15%
- min sample count: 10

You can override thresholds ad hoc:

```bash
node scripts/generate-bench-log.js --verify --max-rme=12 --min-samples=12
```

## Repeatability Check

Before trusting optimization deltas, run three consecutive captures:

```bash
npm run bench:json
npm run bench:json
npm run bench:json
```

Then compare the same benchmark medians across runs. If drift is larger than 5% for hotspot benchmarks, treat the run as unstable and retry under cleaner machine conditions.

## Reading The Stability Section

`bench-results.log` includes a `Stability` section with:

- Highest RME benchmarks
- Lowest RME benchmarks
- Violations

A benchmark is a violation when either:

- `rme > maxRme`
- `sampleCount < minSamples`

## Practical Run Conditions

- Close non-essential CPU and browser workloads.
- Keep power profile stable.
- Do not run in parallel with test or build jobs.
- Prefer back-to-back runs in the same shell session.

## Phase Order

1. Stabilize benchmark harness and thresholds.
2. Confirm repeated runs are consistent.
3. Start optimization work and validate with the same stability gates.
