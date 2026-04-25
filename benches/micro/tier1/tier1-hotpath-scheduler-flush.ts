import { bench, describe, expect } from 'vite-plus/test';
import { globalScheduler } from '../../../src/runtime/scheduler';
import { tier1BenchOptions, verifyTier1Invariant } from '../../shared/_shared';

const taskCount = 500;
const taskIndexes = Array.from({ length: taskCount }, (_, index) => index + 1);

verifyTier1Invariant('tier1 hotpath scheduler flush', () => {
  let total = 0;
  globalScheduler.clearPendingSyncTasks();
  for (const index of taskIndexes) {
    globalScheduler.enqueue(() => {
      total += index;
    });
  }
  globalScheduler.flush();
  expect(total).toBeGreaterThan(0);
  expect(globalScheduler.getState().queueLength).toBe(0);
});

describe('tier1 scheduler flush', () => {
  bench(
    'enqueue and flush a 500-task batch',
    () => {
      let total = 0;
      for (const index of taskIndexes) {
        globalScheduler.enqueue(() => {
          total += index;
        });
      }
      globalScheduler.flush();
      if (total === 0) {
        throw new Error('scheduler batch failed to run');
      }
    },
    {
      ...tier1BenchOptions,
      teardown() {
        globalScheduler.clearPendingSyncTasks();
      },
    }
  );
});
