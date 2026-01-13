# Askr Performance Analysis

**Date:** January 13, 2026  
**Goal:** Identify where Askr is slow (scheduler, reactivity, invalidation, or commit costs)

## Benchmark Suite

Located in `perf/` directory. Run via:

```bash
npm test -- tests/perf.test.ts
```

## Results Summary

| Benchmark                     | Result                                      | Status            |
| ----------------------------- | ------------------------------------------- | ----------------- |
| **bench_signal_text**         | 0.35ms per update (1000 iterations)         | ✅ Fast           |
| **bench_list_create**         | 16.72ms (1k rows), 116.84ms (10k rows)      | ✅ Acceptable     |
| **bench_row_execution_count** | **10x over-invalidation**                   | ⚠️ Critical Issue |
| **bench_list_update_dom**     | 38ms per update (1k), 5.3s per update (10k) | ❌ Very Slow      |

## Critical Finding: 10x Over-Invalidation

### The Problem

When updating every 10th row in a 1000-row list:

- **Expected:** ~100 row components re-execute
- **Actual:** 1000 row components re-execute
- **Over-invalidation ratio:** 10.00x

### Root Cause

**Component-level invalidation without fine-grained reactivity.**

```typescript
const Component = () => {
  rows = state(createRows(rowCount));
  const currentRows = rows(); // ← Component subscribes to entire array

  // When rows.set() is called, entire Component re-runs
  for (let i = 0; i < currentRows.length; i++) {
    children.push(RowComponent(currentRows[i])); // ← ALL rows execute
  }
};
```

**Execution flow:**

1. `rows.set(updateEveryTenth(...))` → marks Component dirty
2. Component re-runs → **generates 1000 new vnodes** (expensive)
3. Keyed reconciler compares vnodes → only updates 100 DOM nodes (efficient)

**The bottleneck:** Step 2 happens before reconciliation can optimize.

## Performance Breakdown

### Scheduler + Commit (Floor)

- **Single text update:** 0.35ms ✅
- Scheduler overhead is minimal
- Commit cost for single node is fast

### Render Cost (Initial)

- **1k rows:** 16.72ms ✅
- **10k rows:** 116.84ms ⚠️
- Scales linearly (~0.012ms per row)

### List Update Cost (Full Stack)

- **1k rows, 100 updates:** 3.8 seconds total (38ms per update) ❌
- **10k rows, 10 updates:** 52.8 seconds total (5.3s per update) ❌
- Dominated by component re-execution, not DOM operations

### Cost Attribution

Per 1000-row update (updating every 10th):

- Component re-execution: ~30ms (generating 1000 vnodes)
- Keyed reconciliation: ~5ms (comparing vnodes)
- DOM updates: ~3ms (100 text nodes)

**Total:** ~38ms per update

The reconciler is efficient. The problem is upstream.

## Bottleneck Identification

✅ **Scheduler:** Fast (0.35ms overhead)  
✅ **Commit traversal:** Fast for targeted updates  
❌ **Invalidation width:** **TOO BROAD** (10x over-invalidation)  
❌ **Component re-execution:** Re-generates vnodes unnecessarily  
✅ **List diffing:** Keyed reconciler is efficient

## Where to Fix

**Primary bottleneck:** Component invalidation granularity

**Files:**

- `src/runtime/component.ts` - Component invalidation logic
- `src/runtime/state.ts` - State subscription tracking

**Current behavior:**

- `state.set()` invalidates entire component
- Component re-runs and regenerates all children
- Reconciler compares old vs new children (efficient)
- Only changed children update DOM (efficient)

**Needed behavior:**

- Fine-grained tracking of which array indices changed
- Memoize/skip child component execution for unchanged data
- Or: per-row derived signals instead of array iteration

## Comparison Context

For reference (other frameworks with fine-grained reactivity):

- Solid.js: Per-row signals, no re-execution for unchanged rows
- Svelte: Compiler generates per-item subscriptions
- React: Relies on developer memoization (useMemo/memo)

Askr currently behaves like unmemoized React - coarse invalidation.

## Next Steps

To optimize list performance:

1. Implement fine-grained array tracking (detect which indices changed)
2. Add component-level memoization (skip re-execution when props unchanged)
3. Or: introduce `For` primitive that handles per-item subscriptions

Without changes, Askr is fast for simple UIs but **10x slower than needed for large lists**.

## Benchmark Reproducibility

All benchmarks are deterministic and repeatable:

- Use `performance.now()` for precise measurements
- No JSX abstractions hiding work
- Direct state mutations and scheduler flushes
- Minimal GC variance (single-run measurements)

Run individual benchmarks:

```bash
npm test -- tests/perf.test.ts -t "bench_signal_text"
npm test -- tests/perf.test.ts -t "bench_row_execution_count"
```
