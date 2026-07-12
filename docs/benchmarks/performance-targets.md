# Performance Targets

Askr does not keep numeric performance targets in source control. Benchmark
workloads, browser versions, and host hardware change often enough that a
copied result becomes a misleading release gate.

Use the raw JSON and `metadata.json` uploaded by the benchmark workflow as the
baseline for a focused change. Capture the baseline and candidate back-to-back
on the same pinned CI runner, repeat each capture three times, and compare the
median for the identical workload name.

## Acceptance Rules

- A benchmark is eligible for tuning only after `generate-bench-log --verify`
  reports at least 10 samples, RME at or below 15%, and non-zero p75/p99.
- Accept a runtime optimization only when its target workload improves by at
  least 5% across the repeated same-host captures.
- Re-run the documented guardrail workloads for the touched subsystem. A
  regression greater than 5% rejects the change unless it is separately
  approved as an intentional trade-off.
- Treat changed labels, changed reset behavior, changed batch sizes, and
  changed browser/runtime versions as new workloads, not comparable baselines.

## Current Investigation Order

After a clean baseline exists, profile these paths before changing code:

1. Production runtime instrumentation overhead.
2. Keyed sparse insertion/reinsertion and full keyed replacement.
3. Keyed movement density crossover in Chromium.
4. Development-only hydration verification.

Every candidate must retain keyed DOM identity, lifecycle ownership, rollback
behavior, and SSR/hydration semantics. A lower benchmark number is not an
acceptable result if it weakens any of those contracts.

## Stable Guardrails

The IDs below are the stable comparison surface. Their workload labels and
source files are validated by `npm run test:bench-contract`; do not compare a
renamed workload as if it were the same row.

| ID | Tier | Workload |
| --- | --- | --- |
| `tier1.router.longest-match` | tier1 | resolve the most specific route from a 512-route dense table |
| `tier1.router.literal-match` | tier1 | match literal route segments |
| `tier1.for.keyed-reorder` | tier1 | swap distant keyed rows while preserving DOM identity |
| `tier2.router.navigation` | tier2 | navigate between sibling routes with shared layout shape |
| `tier2.ssr.layout-route` | tier2 | render a nested layout route with params query and hash |
| `tier3.table.partial-update` | tier3 | update every 10th row in a 1,000-row table |
| `tier3.table.swap-rows` | tier3 | swap two distant rows in a 1,000-row table |
| `tier3.hydration.listener-adoption` | tier3 | hydrate a listener-heavy intrinsic SSR tree in Chromium |
| `tier4.routing.shell-retention` | tier4 | navigate routed shell layouts in the integration app |
| `tier4.ssr.attr-heavy` | tier4 | render 400 attr-heavy nodes with escaped attributes |
