/**
 * Run all performance benchmarks
 * 
 * RUN: npm test -- perf/run.test.ts
 */

import { test } from 'vitest';

test('bench_signal_text', async () => {
  await import('../perf/bench_signal_text');
});

test('bench_list_create', async () => {
  await import('../perf/bench_list_create');
});

test('bench_row_execution_count', async () => {
  await import('../perf/bench_row_execution_count');
});

test('bench_list_update_dom', async () => {
  await import('../perf/bench_list_update_dom');
}, 60000);
