/**
 * Bench helpers
 *
 * Local fast-mode support was removed to keep benchmark runs consistent and
 * reproducible across machines and CI.
 */

export function benchN(defaultN: number): number {
  return defaultN;
}

export function benchIterations(defaultI: number): number {
  return defaultI;
}
