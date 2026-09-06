# List update optimization

The first optimization slice on `refactor/optimize-list-updates` reduces retained
element attribute work and rollback snapshot allocation. The baseline is
`c0c802ac21fa444a1815dc28ea5bbc9354521d64`. The
[capture artifact](../benchmarks/list-updates-c0c802a.json) contains the final
runtime patch and source hashes, raw reports, rejected iterations, environment
provenance, and red/green output.

## TDD and iteration ledger

| Iteration                        | Evidence before changing implementation                                                                                    | Result                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Equal attribute writes           | Three failing regressions: retained rows emitted six redundant attribute mutations; equal HTML/SVG props also mutated DOM. | Skip equal live scalar values and nonempty classes. Tests turn green, but timing alone fails the target.                                |
| Stale attribute collection       | Characterize original Attr references when getters and removal callbacks mutate the live collection.                       | Replace iterator allocation with a reference snapshot; selected resize still misses the target.                                         |
| Empty rollback snapshots         | Characterize independent empty/populated restoration and repeated rollback.                                                | Share frozen empty arrays and allocate control/text records only when needed. Initial timing pass is rejected after an isolated repeat. |
| Small desired-attribute sets     | Characterize zero, one, four, and 24 desired attributes.                                                                   | Use linear membership for up to eight entries, a Set above eight. Conservative resize comparison still misses the target.               |
| Native indexed collection access | Characterize text getters mutating subsequent live children while preserving the earlier child-order snapshot.             | Use native `item(index)` traversal. Both original resize workloads and all final guardrails pass.                                       |

Allocation and traversal changes use behavioral characterization before editing
and the performance threshold as their red/green gate. No artificial failing
tests assert allocation strategy. Snapshot restoration remains owned by the
existing renderer transaction; listener, ref, binding, and component execution
are preserved. Empty HTML and SVG class behavior has separate coverage, and
external attribute mutations are repaired on the next update.

## Final local measurements

Three captures per source on Apple M5, Node 24.20.0, Playwright 1.63.0, production
runtime with instrumentation disabled. Resize uses the existing default clock;
short browser guardrails use the precise clock on both sources. Builds and tests
did not overlap captures.

| Existing workload                       | Conservative baseline median | Candidate median | Change  |
| --------------------------------------- | ---------------------------- | ---------------- | ------- |
| Selected JSX resize, 1,000/2,000 rows   | 20.25 ms                     | 18.00 ms         | -11.11% |
| Unselected JSX resize, 1,000/2,000 rows | 19.75 ms                     | 18.15 ms         | -8.10%  |

Every accepted row has at least ten samples, RME at most 15%, and positive p75
and p99 in every capture. The largest slowdown among the 14 final guardrails is
2.08%, below the unchanged 5% ceiling. The two supplemental directional JSX
diagnostics show growth at -1.04% and shrink at -10.31%. Their inverse reset is
outside timing, so they explain phases rather than replace the original toggle
acceptance workload. The same added harness is installed on the baseline.

Some source series drift by more than 5%; the artifact retains their ranges and
all rejected captures. Filtered resize recaptures compare against the lowest
median of the original and filtered baseline series. Alternating growth/shrink
distributions make toggle medians sensitive to capture variation. These results
qualify these local workloads; they are not a hosted-CI or universal speed claim.

## Correctness verification

Formatting, lint/typecheck, build, public type contracts, installed-package tests,
publint, and package checks pass. The full suite passes 295 unit, 60 repository
check, 1,589 DOM, and 53 standard browser tests. An additional native-browser run
includes the three affected regression files alongside the standard suite:
73 tests pass in each of Chromium, Firefox, and WebKit. Existing coverage retains
hydration, focus, keyed identity, lifecycle, and transactional rollback checks.

The native run uses a temporary configuration extending the normal browser
configuration with `retained-attribute-writes.test.tsx`,
`stale-attribute-collection.test.ts`, and
`retained-snapshot-collection.test.tsx`. Their maintained test location remains
the DOM suite.
