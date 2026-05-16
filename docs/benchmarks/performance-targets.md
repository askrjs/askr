# Performance Targets

Targets are based on the latest committed local benchmark artifacts from
`bench-results/` on April 25, 2026:

- `tier1.json`
- `tier2.json`
- `tier3.json`
- `tier4.json`
- `plan-probe-tier3.json`

Use these as optimization goals, not as permanent public API guarantees. Refresh
the baselines after every meaningful runtime performance change with
`npm run bench:tier1 -- --outputJson bench-results/tier1.json && npm run bench:tier2 -- --outputJson bench-results/tier2.json && npm run bench:tier3 -- --outputJson bench-results/tier3.json && npm run bench:tier4 -- --outputJson bench-results/tier4.json`.

## Target Rules

- Prefer median or mean wall time in milliseconds when comparing snapshots.
- Treat a target as hit only when the benchmark is stable under
  `npm run bench:tier1 -- --outputJson bench-results/tier1.json && npm run bench:tier2 -- --outputJson bench-results/tier2.json && npm run bench:tier3 -- --outputJson bench-results/tier3.json && npm run bench:tier4 -- --outputJson bench-results/tier4.json && node scripts/generate-bench-log.js --verify`.
- A candidate should not regress any listed focus workload by more than 5%.
- Re-run noisy workloads before making decisions if RME is above 15%.

## Phase 1 Targets

These are the first targets to pursue. They focus on the slowest latest results
and leave room for benchmark noise.

| Lane   | Workload                                          |   Current |       Target | Goal       |
| ------ | ------------------------------------------------- | --------: | -----------: | ---------- |
| Tier 3 | truncate 1,000 keyed rows to empty                | 900.00 ms | <= 600.00 ms | 33% faster |
| Tier 3 | append 1,000 keyed rows from empty                | 858.89 ms | <= 575.00 ms | 33% faster |
| Tier 2 | update every 10th row without reordering keys     | 184.29 ms | <= 120.00 ms | 35% faster |
| Tier 1 | enqueue and flush a 500-task batch                | 158.54 ms | <= 110.00 ms | 31% faster |
| Tier 3 | reverse 1,000 keyed rows                          |  68.06 ms |  <= 50.00 ms | 27% faster |
| Tier 3 | shuffle 1,000 keyed rows with a fixed permutation |  61.82 ms |  <= 45.00 ms | 27% faster |
| Tier 4 | generate 64 static routes with metadata           |  46.73 ms |  <= 35.00 ms | 25% faster |

## Phase 2 Targets

These are stretch goals once Phase 1 is mostly green.

| Lane   | Workload                                          |   Current |       Target | Goal       |
| ------ | ------------------------------------------------- | --------: | -----------: | ---------- |
| Tier 3 | truncate 1,000 keyed rows to empty                | 900.00 ms | <= 300.00 ms | 67% faster |
| Tier 3 | append 1,000 keyed rows from empty                | 858.89 ms | <= 300.00 ms | 65% faster |
| Tier 2 | update every 10th row without reordering keys     | 184.29 ms |  <= 75.00 ms | 59% faster |
| Tier 1 | enqueue and flush a 500-task batch                | 158.54 ms |  <= 75.00 ms | 53% faster |
| Tier 3 | reverse 1,000 keyed rows                          |  68.06 ms |  <= 35.00 ms | 49% faster |
| Tier 3 | shuffle 1,000 keyed rows with a fixed permutation |  61.82 ms |  <= 35.00 ms | 43% faster |
| Tier 4 | generate 64 static routes with metadata           |  46.73 ms |  <= 25.00 ms | 47% faster |

## Stability Targets

The latest full run has five RME violations above the 15% stability threshold.
Before using the numbers as release gates, bring these workloads under control:

| Lane   | Workload                                            | Current RME | Target RME |
| ------ | --------------------------------------------------- | ----------: | ---------: |
| Tier 3 | append 1,000 keyed rows from empty                  |      45.43% |  <= 15.00% |
| Tier 3 | truncate 1,000 keyed rows to empty                  |      45.07% |  <= 15.00% |
| Tier 4 | generate 64 static routes with metadata             |      29.36% |  <= 15.00% |
| Tier 3 | shuffle 1,000 keyed rows with a fixed permutation   |      18.55% |  <= 15.00% |
| Tier 4 | render 400 attr-heavy nodes with escaped attributes |      16.37% |  <= 15.00% |

## Guardrail Targets

These workloads are already comparatively healthy. Keep them within 5% of the
latest result while optimizing the focus paths.

| Lane   | Workload                                                     |   Current |    Guardrail |
| ------ | ------------------------------------------------------------ | --------: | -----------: |
| Tier 1 | resolve the most specific route from a 512-route dense table | 0.0174 ms | <= 0.0183 ms |
| Tier 1 | match literal route segments                                 | 0.0004 ms | <= 0.0005 ms |
| Tier 2 | render a nested layout route with params query and hash      | 0.0332 ms | <= 0.0349 ms |
| Tier 2 | stream a 250-item article route                              | 0.1572 ms | <= 0.1651 ms |
| Tier 3 | swap distant keyed rows while preserving DOM identity        |  10.45 ms |  <= 10.98 ms |
| Tier 3 | update one keyed row label in a 1,000-row table              |  12.52 ms |  <= 13.15 ms |

## Probe Targets

The latest tier-3 probe captured production-style table operations separately.
Use these as investigation targets when validating table optimizations:

| Workload                                   |   Current | Phase 1 Target | Phase 2 Target |
| ------------------------------------------ | --------: | -------------: | -------------: |
| update every 10th row in a 1,000-row table | 268.92 ms |   <= 175.00 ms |   <= 100.00 ms |
| swap two distant rows in a 1,000-row table |  17.68 ms |    <= 13.00 ms |    <= 10.00 ms |
