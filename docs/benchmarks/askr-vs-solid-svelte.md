# Benchmark: Askr vs Solid vs Svelte ⚖️

## Summary

This document records benchmark results comparing Askr (v0.0.9), Solid, and Svelte across key metrics: runtime performance for creating and updating 1,000 rows, bundle size (uncompressed), and memory usage in ready state.

---

## Results

### Create 1,000 rows (01_run1k)
- **Askr:** 50.1 ms (10.0 ms script, 39.0 ms paint)
- **Solid:** 39.9 ms (4.4 ms script, 34.8 ms paint) ⚡ ~20% faster
- **Svelte:** 41.9 ms (4.8 ms script, 36.3 ms paint) ⚡ ~16% faster

### Update every 10th row x16 (03_update10th1k_x16)
- **Askr:** 255.1 ms (71.7 ms script, 178.6 ms paint)
- **Solid:** 28.8 ms (2.1 ms script, 23.9 ms paint) ⚡ ~89% faster
- **Svelte:** 29.3 ms (2.7 ms script, 24.0 ms paint) ⚡ ~88% faster

### Bundle Size (uncompressed)
- **Askr:** 51.3 KB
- **Solid:** 11.5 KB ⚡ 78% smaller
- **Svelte:** 34.0 KB ⚡ 34% smaller

### Memory Usage (ready state)
- **Askr:** 0.67 MB
- **Solid:** 0.52 MB ⚡ 22% less
- **Svelte:** 0.60 MB ⚡ 10% less

---

## Analysis & Takeaways

- **Performance gap on updates:** Askr (v0.0.9) is significantly slower on updates—roughly 8–9x slower than Solid and Svelte in the `update every 10th row` benchmark. This suggests Askr's reactivity and partial-update path need optimization.
- **Creation cost is reasonable:** Askr's initial create cost is within ~20% of competitors but still slower.
- **Bundle size is larger:** Askr's uncompressed bundle is notably larger than Solid and somewhat larger than Svelte—opportunity for tree-shaking and code-size optimizations.
- **Memory:** Askr uses somewhat more memory at ready state; optimizations here may reduce footprint.

## Recommendations

- Profile Askr's update path (reconciliation and reactivity triggers) to identify high-cost operations.
- Add microbenchmarks isolating the reactivity system to pinpoint hot paths.
- Investigate bundle size reductions via code splitting, dead-code elimination, and smaller runtime primitives.
- Track these metrics across PRs to measure regressions/improvements.

---

> Notes: All implementations passed smoke tests and produced complete benchmark results; this provides a solid baseline for iterative improvements.


---

*File generated from benchmark summary provided on 2026-01-13.*
