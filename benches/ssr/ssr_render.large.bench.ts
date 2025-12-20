/**
 * SSR render large-tree benchmarks
 *
 * Add larger and deeper trees to stress serialization and allocation costs.
 */

import { bench, describe } from 'vitest';
import { captureSSRSnapshot } from '../../tests/helpers/test_renderer';
import { benchN, benchIterations } from '../helpers/bench_config';

describe('ssr render (large)', () => {
  // Removed smaller large-tree SSR cases (500, 2000 sections) to keep one representative large-case.
  // These cases were redundant and made the SSR bench output noisy; keeping the 10k case focuses on the performance cliff.

  const HUGE_10K = benchN(10000);
  const HUGE_ITERS = benchIterations(20);

  bench('20 huge tree SSRs (10000 sections)', async () => {
    const Huge = () => ({
      type: 'div',
      children: Array.from({ length: HUGE_10K }, (_, i) => ({
        type: 'section',
        props: { key: String(i) },
        children: [
          { type: 'h2', children: [String(i)] },
          { type: 'p', children: ['Lorem ipsum dolor sit amet.'] },
        ],
      })),
    });

    for (let i = 0; i < HUGE_ITERS; i++) {
      await captureSSRSnapshot(Huge);
    }
  });
});
