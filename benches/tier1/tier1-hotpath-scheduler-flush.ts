import { describe, expect, test } from 'vite-plus/test';
import {
  clearScheduler,
  flushSync,
  getSchedulerState,
  queueTask,
} from '../../src/core/reactive/scheduler';
import {
  tier1BenchOptions,
  verifyTier1Invariant,
  runBench,
} from '../shared/_shared';

const taskCount = 500;
const taskIndexes = Array.from({ length: taskCount }, (_, index) => index + 1);

verifyTier1Invariant('tier1 hotpath scheduler flush', () => {
  let total = 0;
  clearScheduler();
  for (const index of taskIndexes) {
    queueTask(() => {
      total += index;
    });
  }
  flushSync();
  expect(total).toBeGreaterThan(0);
  expect(getSchedulerState().queueLength).toBe(0);
});

describe('tier1 scheduler flush', () => {
  test('enqueue and flush a 500-task batch', async ({ bench }) => {
    await runBench(
      bench,
      'enqueue and flush a 500-task batch',
      () => {
        let total = 0;
        for (const index of taskIndexes) {
          queueTask(() => {
            total += index;
          });
        }
        flushSync();
        if (total === 0) {
          throw new Error('scheduler batch failed to run');
        }
      },
      {
        ...tier1BenchOptions,
        teardown() {
          clearScheduler();
        },
      }
    );
  });
});
