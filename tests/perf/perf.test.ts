/**
 * Run all performance benchmarks
 *
 * RUN: npm test -- perf/run.test.ts
 */

import { test } from 'vitest';

test('should run bench_signal_text', async () => {
  await import('./bench_signal_text');
});

test('should run bench_list_create', async () => {
  await import('./bench_list_create');
});

test('should run bench_row_execution_count', async () => {
  await import('./bench_row_execution_count');
});

test('should run bench_list_update_dom', async () => {
  process.env.ASKR_BENCH_FAST = '1';
  await import('./bench_list_update_dom');
}, 60000);
