/**
 * Benchmark metrics utilities
 *
 * Provides utilities for collecting and analyzing benchmark metrics.
 */

export interface BenchmarkResult {
  name: string;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  samples: number[];
  allocations?: number;
  domOps?: number;
}

/**
 * Collect timing samples for statistical analysis
 * Supports async functions by awaiting the result.
 */
export async function collectSamples(
  fn: () => void | Promise<void>,
  iterations: number = 100
): Promise<number[]> {
  const samples: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    samples.push(end - start);
  }

  return samples;
}

/**
 * Warm-up helper to stabilize JIT and shapes before measurement
 */
export async function warmUp(
  fn: () => void | Promise<void>,
  iterations: number = 10
): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
}

/**
 * Calculate percentiles from samples
 */
export function calculatePercentiles(samples: number[]): {
  p50: number;
  p95: number;
  p99: number;
} {
  if (samples.length === 0) {
    return { p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const len = sorted.length;

  return {
    p50: sorted[Math.floor(len * 0.5)],
    p95: sorted[Math.floor(len * 0.95)],
    p99: sorted[Math.floor(len * 0.99)],
  };
}

/**
 * Calculate mean from samples
 */
export function calculateMean(samples: number[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

/**
 * Format benchmark result for reporting
 */
export function formatResult(result: BenchmarkResult): string {
  return `${result.name}: ${result.mean.toFixed(2)}ms (p50: ${result.p50.toFixed(2)}ms, p95: ${result.p95.toFixed(2)}ms, p99: ${result.p99.toFixed(2)}ms)`;
}
