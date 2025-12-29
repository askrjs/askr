# Performance Issues & Action Plan (Askr)

This doc is the living tracker for performance work in Askr.
It summarizes current benchmark hotspots and lays out a concrete plan to make Askr *world class* across:

- interactive latency (commit/flush time)
- throughput (updates/sec, SSR/sec)
- scalability (10k+ nodes, burst updates)
- variance (p99/p999 stability)
- memory/GC pressure

## Ground rules

- **Do not trade correctness for benchmark wins.** Benchmarks validate real user-visible costs.
- Prefer **platform primitives** and simple mechanisms. Keep the runtime’s mental model minimal.
- Maintain the benchmark taxonomy and naming convention in [benches/README.md](benches/README.md).

## How to reproduce

Run the full suite:

```sh
npm run bench
```

Run a single file:

```sh
npx vitest bench --run --reporter=default --config vitest.bench.config.ts benches/ssr/ssr-render.large.bench.tsx
```

Recommended: run on a quiet machine (no CPU scaling / minimal background load) and record:

- OS, CPU model, RAM
- Node version (`node -v`)
- whether running on battery / power saver

## Current benchmark hotspots (observed)

From the latest `npm run bench` output (Dec 2025, local run):

### 1) SSR huge tree is the top cost center

- `benches/ssr/ssr-render.large.bench.tsx` → **“20 huge tree SSRs (10000 sections)”**
  - Mean ~**79 ms/op** (≈ 12.6 hz)

Why it matters:
- This is the ceiling for “big page SSR” and will dominate TTFB on large documents.

Likely contributors to investigate:
- string building strategy (concats vs chunk arrays)
- escaping / attribute serialization
- recursion depth / call overhead
- allocations (intermediate arrays, object churn)

### 2) Commit frequency dominates scheduler cost

- `benches/runtime/scheduler-overhead.bench.tsx`:
  - **“100 queued tasks (transactional)”** mean ~2.13 ms/op
  - **“100 updates + 100 commits (worst case) (transactional)”** mean ~30.8 ms/op

Why it matters:
- The delta strongly suggests per-commit fixed overhead is large.
- It validates that batching semantics are critical, but also indicates we can reduce the fixed cost of a commit/flush.

### 3) Bulk DOM update scaling knee

- `benches/dom/text-node-updates.bench.tsx`:
  - **“framework::text-node-updates::200::…bulk-large”** mean ~13.3 ms/op
  - ~46× slower than the small baseline in that suite

Why it matters:
- Non-linear scaling is where “feels fast” turns into “falls off a cliff” at realistic sizes.

Likely contributors:
- inner-loop allocation
- repeated DOM writes that could be coalesced
- reconciliation walking cost
- string conversion / formatting in hot paths

### 4) “Successful commit” is much heavier than rollback paths

- `benches/runtime/commit-vs-rollback.bench.tsx`:
  - **“successful commit”** mean ~7.1 ms/op
  - rollback variants mean ~0.58–0.59 ms/op

Why it matters:
- Rollback benches throw early; they don’t execute the full DOM commit path.
- If optimizing for typical workloads, focus on the successful commit/patch pipeline.

## Interpretation & caveats

- JSDOM and Node can produce **tail spikes** (GC, JIT, background activity). Track mean + p75 for day-to-day changes and inspect p99/p999 for regressions.
- Bench results are most comparable when:
  - you pin Node version
  - you run with consistent power/perf settings
  - you avoid mixing Tier A and Tier B comparisons

## Action plan (make Askr world class)

This is ordered by leverage: changes near the root of the runtime tend to lift many benchmarks at once.

### A) Establish performance guardrails (prevents regressions)

1. **Define a small set of “north star” benches** (5–10) representing:
   - scheduler worst-case commit frequency
   - SSR huge tree
   - one keyed reorder large case
   - one bulk DOM update case
   - one navigation / route transition case
2. Add a CI job that:
   - runs only the north-star set
   - stores raw output as an artifact
   - fails on large regressions (initially manual thresholds; evolve to statistical gating)
3. Add a “how to profile” section (Node flags, cpuprofile naming conventions).

Deliverable:
- stable trend line + “no silent perf regressions” policy

### B) Reduce fixed commit/flush overhead (highest ROI)

Target symptom:
- The large gap between “100 queued tasks (single flush)” vs “100 updates + 100 commits”.

Work items:
1. **Profile the commit path** under `benches/runtime/scheduler-overhead.bench.tsx` worst-case.
2. Reduce per-commit fixed costs:
   - minimize repeated DOM lookups / repeated reads of the same node state
   - avoid allocating transient arrays/objects during commit
   - keep hot loops monomorphic (stable object shapes)
3. Improve batching ergonomics without new primitives:
   - ensure existing transactional semantics are easy/idiomatic
   - document “avoid flushing per update” patterns clearly

Deliverable:
- meaningfully lower commit fixed cost and better p99 stability.

### C) Make SSR (large) fast and allocation-light

Work items:
1. Profile `benches/ssr/ssr-render.large.bench.tsx`.
2. Optimize SSR serialization:
   - prefer chunk accumulation + single join/write rather than repeated concatenation
   - consider fast paths for common node shapes (text-only, attribute-light)
   - reduce escaping overhead (only escape when needed; fast ASCII scan)
3. Validate correctness with hydration tests (no behavior regressions).

Deliverable:
- SSR throughput improvement and reduced variance.

### D) Fix bulk update scaling knees (DOM + reconcile)

Work items:
1. Profile `text-node-updates` and `attribute-updates` bulk cases.
2. Reduce inner-loop overhead:
   - avoid per-node closure creation
   - reuse buffers where safe
   - coalesce DOM writes when semantics allow
3. Ensure Tier B benches reflect realistic end-to-end patterns (no setup in hot loop).

Deliverable:
- smoother scaling curves (avoid cliffs at 200/1k/10k sizes).

### E) Memory & GC: make performance stable, not just fast

Work items:
1. Add a small set of memory-focused checks:
   - allocation counts (where feasible)
   - stress tests that detect runaway growth
2. Identify churn hotspots:
   - VNode creation patterns
   - reconciliation scratch structures
   - string/array allocations in SSR

Deliverable:
- lower tail latencies; fewer long GC pauses.

### F) Developer-facing guidance (so apps stay fast by default)

Work items:
1. Add a short “Performance playbook” section to the docs:
   - batching updates
   - avoiding per-keystroke full commits
   - SSR patterns for large lists (pagination/windowing where appropriate)
2. Keep guidance aligned with Askr’s principles:
   - normal JS control flow
   - runtime handles time
   - standard cancellation via `AbortSignal`

Deliverable:
- the default way of writing Askr code is also the fast way.

## Immediate next steps (suggested)

1. Capture CPU profiles for the top two hotspots:
   - `benches/ssr/ssr-render.large.bench.tsx`
   - `benches/runtime/scheduler-overhead.bench.tsx` (“100 updates + 100 commits”)
2. Write down the top 5 functions by self time.
3. Implement one small, low-risk change at a time and re-run the north-star benches.

---

If you’re adding a new perf issue, add it under the relevant section with:

- benchmark name + file
- observed mean and p99/p999 (if relevant)
- suspected cause
- proposed fix
- how to validate (bench + correctness tests)
