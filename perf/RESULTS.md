# Performance Fix: For Primitive

**Status:** ✅ **FIXED** - Over-invalidation eliminated

## Before and After

### Before: Manual .map() iteration

```
Total rows: 1000
Update every 10th row
Expected executions: ~100
Actual executions: 1000
Over-invalidation: YES (10x)
```

### After: For primitive

```
Total rows: 1000
Update every 10th row
Expected executions: ~100
Actual executions: 100
Over-invalidation: NO ✓
```

## Solution: For Primitive

Implemented a `For` primitive that creates per-item component boundaries:

```typescript
// Before (10x over-invalidation)
const Component = () => {
  const rows = state([...]);
  const currentRows = rows();
  return currentRows.map(row => RowComponent(row));  // ❌ ALL rows re-execute
};

// After (no over-invalidation)
const Component = () => {
  const rows = state([...]);
  return For(rows, (row) => RowComponent(row), { by: r => r.id });  // ✓ Only changed rows
};
```

## Key Features

- **Explicit keying** via `by` function
- **Per-item component instances** with isolated state
- **Keyed reconciliation** (preserves instances, updates data by identity)
- **No memoization** (deterministic re-execution when data changes)
- **Reactivity boundary** (prevents parent re-execution)

## Implementation

- Design: [docs/for-primitive-design.md](../docs/for-primitive-design.md)
- Runtime: [src/runtime/for.ts](../src/runtime/for.ts)
- Public API: [src/for.ts](../src/for.ts)
- Test: [perf/bench_row_execution_count.ts](../perf/bench_row_execution_count.ts)

## Performance Impact

**Expected improvement for list updates:**

- 1k rows, update 10%: **10x faster** (38ms → ~4ms per update)
- 10k rows, update 10%: **10x faster** (5.3s → ~530ms per update)

The For primitive eliminates the primary bottleneck (component over-invalidation) while maintaining deterministic execution semantics.
