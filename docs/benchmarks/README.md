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

Very short workloads must span enough clock ticks for the 5% guardrail to be
meaningful. Router matching times 128 calls per sample; table swapping times
32 alternating, synchronously flushed swaps. Names include these counts.
Compare identical blocks, or divide duration percentiles by the count when
reporting per-operation values. Keep single-operation captures as diagnostic
evidence when quantization makes their median unsuitable for qualification.

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

The [intermediate architecture capture](./core-architecture-6b4ad7e.json)
compares `6b4ad7e` with both the preceding stage (`eda6558`) and the initial
baseline (`c19ff42`, unchanged runtime from `48a5575`). Each of the three
revisions has three sequential captures per tier on the same host and toolchain.
All 21 guardrails meet every sample-quality requirement. The maximum slowdown
is 2.18% against the preceding stage and 4.55% across the complete series.
The first candidate failed table truncation at +8.33% and +18.18% respectively;
its complete comparisons remain in the evidence. A Chromium CPU profile traced
substantial cleanup work to environment normalization for unused-state warnings
on components without state. Checking for state first preserves diagnostics and
removes that work. These captures include that fix and the complete
compatibility implementation; table truncation returns to a 2.2 ms median.
These measurements qualify this host and these workloads, not all applications.
Packed Monaco qualification subsequently rejected this candidate's initial
entry size (229,464 bytes against a 225,000-byte limit). These measurements are
retained as intermediate evidence; final qualification also includes the native
boot composition and consolidated bookkeeping that address that rejection.

The [completed architecture qualification](./core-architecture-25bf231.json)
records the final runtime at `25bf231` and the resolution-corrected measurements
at `b9f82ba` (identical runtime). All 21 guardrails qualify against both the
preceding stage and the initial baseline. Maximum slowdowns are 1.91% and 4.77%
respectively. Original single-operation captures and the initially failed
navigation comparison remain in the evidence. Navigation's repeated isolated
capture uses the lower of its two baseline controls. Packed Monaco's initial
entry is 224,987 bytes against its unchanged 225,000-byte budget, compared with
214,709 bytes for published 0.2.4. No general optimization claim is made.

The [SOLID remediation qualification](./solid-accepted-497b494.json) covers all
twelve stable guardrails and six affected diagnostics against `aa45809`, plus a
separate selected-resize optimization comparison. All 171 accepted captures meet
quality requirements; the largest regression is 2.66% and the optimization gain
is 8.50%. Two short browser rows use verified 0.005 ms clocks on both sources,
with unchanged operations. Rejected captures, clock-resolution limitations, and
residual source-series drift remain in the evidence and
[implementation ledger](../development/solid-implementation.md).

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
