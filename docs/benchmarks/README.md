# Benchmark Index

Askr benchmarks are organized by tier so each lane measures a different layer of the runtime.

## Lanes

| Lane    | Scope                                   | Runtime        |
| ------- | --------------------------------------- | -------------- |
| `tier1` | Hot-path primitives and tight loops     | Node           |
| `tier2` | Runtime subsystems and shared behaviors | jsdom and Node |
| `tier3` | System-level browser/runtime behavior   | Chromium       |
| `tier4` | Browser integration scenarios           | Chromium       |

## What To Run

Use the aggregated script for a local signal check:

```bash
npm run bench
```

Use the lane scripts when you need a narrower capture or a JSON artifact for reporting:

```bash
npm run bench:tier1
npm run bench:tier2
npm run bench:tier3
npm run bench:tier4
```

Normal lane runs compile the production hot path without benchmark counters,
phase timers, or diagnostic wrappers. To investigate attribution rather than
capture production timing, opt in explicitly:

```bash
ASKR_BENCH_INSTRUMENTATION=1 npm run bench:tier1
```

The maintained comparison contract is documented in
[performance targets](./performance-targets.md) and implemented by the tracked
benchmark files selected by the four `vitest.bench.tier*.config.ts` files. Keep
documented workload IDs and labels aligned with those implementations.

## Reading Results

The generated [stability workflow](./stability.md) and [performance targets](./performance-targets.md) docs explain how to use the output.

JSON files contain the raw fields emitted by the benchmark reporter. Provenance
(Node/npm versions, commit and dirty state, runner image, CPU/architecture,
Playwright revision, lockfile hash, and instrumentation mode) is recorded beside
them. Tail ratios and median-of-three comparisons are derived during analysis;
they are not raw reporter fields. A row is eligible only with at least 10
samples, RME no greater than 15%, and nonzero p75 and p99.

The lane-specific diagnostics in this repo are intentionally separated so cleanup
cost can be reviewed independently from ordered work loops and ordered DOM
movement paths.

CI benchmark artifacts include the raw JSON and are compared only for the same
benchmark row from three back-to-back captures on the same pinned host.

The [core consolidation baseline](./core-baseline-48a5575.json) records three
sequential captures of all four tiers at `48a5575`, with environment provenance
and each row's median, mean, tails, RME, and sample count. All 38 browser rows
passed the sample-quality rule in every capture. Across all tiers, 81 of 93
rows qualified in every capture; the remaining 12 are explicitly marked
ineligible and require fresh captures before a performance comparison. This is
a local baseline, not an optimization claim or a comparison to CI timings.

A [repeat of tiers 1 and 2](./core-baseline-4ff68b5.json) records the same runtime
after raising Tier 2's default minimum from four to ten iterations. Every row
met the sample-count floor; 47 of 55 rows met all quality rules in all three
runs. The remaining high-RME rows are still ineligible. Structural PRs must
recapture any affected ineligible row before using it as a comparison guardrail.

The [compatibility boundary qualification](./core-compatibility-658ecbb.json)
compares refreshed `main` (`c19ff42`) with `658ecbb` on the same host and
toolchain. Three baseline and three candidate captures per tier cover all 12
documented guardrails and four additional scheduler/route rows. All 16 rows
qualified in every capture and stayed within the 5% regression limit; the
largest median slowdown was 0.74%. This establishes performance preservation
for the boundary change and makes no optimization claim.

The [ownership qualification](./core-ownership-8847810.json) compares `ffa0ff4`
with `8847810`. Three baseline and three candidate captures cover the same
16 rows plus query cancellation and Show/Case branch changes. All 19 rows
qualified in every capture and stayed within the 5% regression limit. The
largest median slowdown was 4.55% for table truncation; component-chain
mount/cleanup changed by +1.16%, and shared-layout navigation by -0.14%.
This is performance preservation evidence, with no optimization claim.

The [renderer ownership qualification](./core-renderer-fe12030.json) compares
`346b05a` with `fe12030` across 21 rows, including delegated event dispatch.
All three baseline and three candidate captures met the quality rules and
the 5% regression limit. Table truncation changed from 2.3 ms to 2.4 ms
(+4.35%); the other 20 rows changed by at most +1.13%. Earlier candidates
failed the truncation guardrail at +13.04% and +8.70% and were rejected.
The accepted implementation consolidates native range indexes and scope
boundary work. This is preservation evidence, with no optimization claim.

The [commit protocol qualification](./core-commit-27e1e84.json) compares
`d11a790` with `27e1e84` across 21 rows. All repeated captures meet the sample
rules and regression limit; the maximum slowdown is 4.55% for hydration.

The [integration qualification](./core-integration-451497e.json) compares
`b48c2fb` with `451497e` across 21 rows. The final accepted comparisons meet
the sample rules and regression limit, with a maximum slowdown of 2.91%.
The initial dense-route comparison failed at +8.26%. Its complete statistics
remain in the evidence alongside an isolated baseline/control/candidate
investigation. The accepted dense-route baseline is the lower of the two
control medians, captured immediately before the candidate; that comparison
is +2.91%. No matching code was tuned in response to capture variability.
The other 20 rows passed the original final-source capture. These structural
changes make no optimization claim.

## External JFB Comparisons

The local `js-framework-benchmark` capture is a separate product-level signal
from the tiered Askr guardrails. For JFB comparisons, keep the framework,
benchmark ID, browser, throttling mode, reset behavior, and iteration count
identical. Report total duration, measured script time, and paint time as separate
columns; a faster script phase does not imply a faster end-to-end row.
Hydration/adoption and deferred activation are separate phases and must not be
collapsed into one root-wide timing.

The keyed movement-density diagnostic uses permutations requiring exactly 200,
500, 1,000, 1,500, and 1,999 moves on a 2,000-row table, with the LIS length
verified independently. Full append/clear teardown is reported
separately so cleanup cost does not get misattributed to the reorder path. The
`tier3-system-table-keyed-movement-density.tsx` diagnostic provides a matching
Chromium workload for the component-boundary keyed reorder subsystem; use it
before treating a jsdom-only result as a browser optimization target. The movement-density
diagnostic is a separate signal from cleanup-time deltas.

The component-boundary reorder diagnostic is
`tier3-system-keyed-lis-component-boundary.tsx`. Use its Chromium result as
the authority for the corresponding jsdom subsystem workload; do not tune the
runtime from a jsdom-only hotspot when the browser workload is materially
different.
