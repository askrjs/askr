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

The generated lane JSON files contain raw benchmark reporter fields. Record
environment provenance separately and calculate tail ratios and
median-of-three comparisons during analysis. For stability review, compare
same-host captures and treat variance, wide tails, and timer-resolution edges
as signals to re-run and investigate before tuning.

## Repeatability Check

Before trusting optimization deltas, run each tier three consecutive times under
the same machine conditions, using distinct output files. For example:

```bash
npm run bench:tier1 -- --outputJson bench-results/tier1-run1.json
npm run bench:tier1 -- --outputJson bench-results/tier1-run2.json
npm run bench:tier1 -- --outputJson bench-results/tier1-run3.json
```

Repeat that explicit sequence for tiers 2 through 4. Do not use a workflow
matrix or run captures concurrently. Tier 3 create, append, truncate, clear,
and disjoint-replacement rows time only the forward mutation; their inverse
reset runs in a microtask before the next sample. Tier 4 toggle rows remain
bidirectional churn diagnostics and must not be used for phase attribution.

If hotspot medians drift by more than 5%, retry under cleaner machine conditions before drawing conclusions. Do not compare local output to a CI capture or compare renamed/changed workloads; use the matching raw JSON row and environment metadata.

## Practical Conditions

- Close non-essential CPU and browser workloads.
- Keep the power profile stable.
- Do not run in parallel with test or build jobs.
- Prefer back-to-back runs in the same shell session.
