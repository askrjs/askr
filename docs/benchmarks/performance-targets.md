# Performance Targets

Askr does not keep numeric performance targets in source control. Benchmark
workloads, browser versions, and host hardware change often enough that a
copied result becomes a misleading release gate.

Use the raw JSON and `provenance.txt` uploaded in the `bench-results-stable`
workflow artifact as the baseline for a focused change. Capture the baseline
and candidate back-to-back on the same pinned CI runner, repeat each capture
three times, and compare the median for the identical workload name.

The manual benchmark workflow accepts an optional `baseline` commit. When
provided, it installs that revision separately and runs each baseline capture
immediately before its candidate capture on the same runner. Both sets of raw
JSON and their commit/lockfile provenance are uploaded together. Optional `tier`
and `pattern` inputs isolate unchanged workloads when broad captures show
variation. Retain rejected captures alongside recaptures; filtering does not
change the sample-quality or regression limits. When sample collection options
change, the optional `harness` commit installs identical benchmark sources on
the baseline; the harness SHA and complete baseline benchmark diff are retained
in the artifact. Runtime sources, labels, operations, and reset behavior remain
unchanged by this option. Optional `control` captures repeat the baseline before
each candidate to measure variation. Compare the candidate against the lower
of the two baseline medians of three, retaining every control and candidate.

## Acceptance Rules

- A benchmark is eligible for tuning only after repeat captures consistently show at
  least 10 samples, RME at or below 15%, and non-zero p75/p99.
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

The movement-density diagnostic is
`tier3-system-table-keyed-movement-density.tsx`; it compares 10%, 25%, 50%,
75%, and 100% keyed movement in the same 2,000-row table. Profile LIS work,
DOM key-map construction, range moves, and dense replacement separately before
changing the movement strategy. Full-clear teardown is a separate diagnostic;
do not combine its cleanup cost with append or reorder measurements.

The component-boundary reorder diagnostic is
`tier3-system-keyed-lis-component-boundary.tsx`. Use its Chromium result as
the authority for the corresponding jsdom subsystem workload; do not tune the
runtime from a jsdom-only hotspot when the browser workload is materially
different.

Every candidate must retain keyed DOM identity, lifecycle ownership, rollback
behavior, and SSR/hydration semantics. A lower benchmark number is not an
acceptable result if it weakens any of those contracts.

## Stable Guardrails

The IDs below are the stable comparison surface. Keep these workload labels and
source files stable, and do not compare a renamed workload as if it were the same row.

| ID                                  | Tier  | Workload                                                     |
| ----------------------------------- | ----- | ------------------------------------------------------------ |
| `tier1.router.longest-match`        | tier1 | resolve the most specific route from a 512-route dense table |
| `tier1.router.literal-match`        | tier1 | match literal route segments                                 |
| `tier1.for.keyed-reorder`           | tier1 | swap distant keyed rows while preserving DOM identity        |
| `tier2.router.navigation`           | tier2 | navigate between sibling routes with shared layout shape     |
| `tier2.ssr.layout-route`            | tier2 | render a nested layout route with params query and hash      |
| `tier2.runtime.component-depth`     | tier2 | mount and clean up a 1,000-component wrapper chain           |
| `tier3.table.partial-update`        | tier3 | update every 10th row in a 1,000-row table                   |
| `tier3.table.swap-rows`             | tier3 | swap two distant rows in a 1,000-row table                   |
| `tier3.table.truncate-rows`         | tier3 | truncate a 2,000-row table to its first 1,000 keyed rows     |
| `tier3.hydration.listener-adoption` | tier3 | hydrate a listener-heavy intrinsic SSR tree in Chromium      |
| `tier4.routing.shell-retention`     | tier4 | navigate routed shell layouts in the integration app         |
| `tier4.ssr.attr-heavy`              | tier4 | render 400 attr-heavy nodes with escaped attributes          |

Movement thresholds and teardown traversal changes require at least 5%
improvement across three same-host captures, with touched guardrails within 5%
of their baseline. Until that evidence exists, the current sparse/interleaved
move path and exactly-once cleanup traversal remain the reference behavior.
