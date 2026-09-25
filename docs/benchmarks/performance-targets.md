# Performance Targets

Askr does not keep numeric performance targets in source control. Benchmark
workloads, browser versions, and host hardware change often enough that a
copied result becomes a misleading release gate.

Use the raw JSON and `provenance.txt` uploaded in the `bench-results-stable-tier<N>`
workflow artifacts as the baseline for a focused change. Capture the baseline
and candidate back-to-back on the same pinned CI runner, repeat each capture
three times, and compare the median for the identical workload name.

The manual benchmark workflow accepts an optional `baseline` commit. When
provided, it installs that revision separately and runs each baseline capture
immediately before its candidate capture on the same runner. Both sets of raw
JSON and their commit/lockfile provenance are uploaded together. Optional `tier`,
`pattern`, and repository-relative `file` inputs select unchanged workloads when
broad captures show variation. The same file filter applies to every baseline,
control, and candidate capture and is recorded in `provenance.txt`; omitting it
keeps all files in the selected tier. Name filtering alone still imports other
files and runs their top-level preflights. File filtering removes that preceding
work. Benchmark files already execute sequentially; the effect of removing
unrelated preflights on capture variation is not yet established. Retain rejected
captures alongside recaptures; filtering does not change the sample-quality or
regression limits. When sample collection options change, the optional `harness`
commit installs identical benchmark sources on
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
3. Keyed movement density crossover.
4. Development-only hydration verification.

For keyed movement, profile LIS work, DOM key-map construction, range moves,
and dense replacement separately before changing the movement strategy. Do not
combine full-clear teardown cost with append or reorder measurements.

There is no browser benchmark lane. Confirm a jsdom hotspot with a real-browser
profile before tuning the runtime for it.

Every candidate must retain keyed DOM identity, lifecycle ownership, rollback
behavior, and SSR/hydration semantics. A lower benchmark number is not an
acceptable result if it weakens any of those contracts.

## Stable Guardrails

The IDs below are the stable comparison surface. Keep these workload labels and
source files stable, and do not compare a renamed workload as if it were the same row.

| ID                              | Tier  | Workload                                                     |
| ------------------------------- | ----- | ------------------------------------------------------------ |
| `tier1.router.longest-match`    | tier1 | resolve the most specific route from a 512-route dense table |
| `tier1.router.literal-match`    | tier1 | match literal route segments                                 |
| `tier1.for.keyed-reorder`       | tier1 | swap distant keyed rows while preserving DOM identity        |
| `tier2.router.navigation`       | tier2 | navigate between sibling routes with shared layout shape     |
| `tier2.ssr.layout-route`        | tier2 | render a nested layout route with params query and hash      |
| `tier2.runtime.component-depth` | tier2 | mount and clean up a 1,000-component wrapper chain           |

Movement thresholds and teardown traversal changes require at least 5%
improvement across three same-host captures, with touched guardrails within 5%
of their baseline. Until that evidence exists, the current sparse/interleaved
move path and exactly-once cleanup traversal remain the reference behavior.
