/**
 * Bench helpers — fast mode removed
 *
 * Previous versions supported a local "fast" mode (BENCH_FAST / BENCH_QUICK)
 * to scale down iteration counts for local experimentation. That feature has
 * been removed to keep benchmark runs consistent and reproducible.
 */

export function benchN(defaultN: number): number {
  return defaultN;
}

export function benchIterations(defaultI: number): number {
  return defaultI;
}
