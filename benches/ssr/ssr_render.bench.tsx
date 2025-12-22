/**
 * SSR render benchmark
 *
 * Measures the cost of server-side rendering.
 */

import { bench, describe } from 'vitest';
import { captureSSRSnapshot } from '../../tests/helpers/test_renderer';

describe('ssr render', () => {
  bench('100 simple component SSRs (behavioral)', async () => {
    // Pure, synchronous server-side rendering of a minimal component
    const Simple = () => ({ type: 'div', children: ['hello'] });
    for (let i = 0; i < 100; i++) {
      await captureSSRSnapshot(Simple);
    }
  });

  bench('100 complex component SSRs (behavioral)', async () => {
    // Pure, synchronous SSR of a moderate component tree
    const Complex = () => ({
      type: 'div',
      children: [
        { type: 'h1', children: ['Title'] },
        { type: 'p', children: ['Paragraph text for SSR bench'] },
        {
          type: 'ul',
          children: Array.from({ length: 10 }, (_, i) => ({
            type: 'li',
            props: { key: String(i) },
            children: [String(i)],
          })),
        },
      ],
    });
    for (let i = 0; i < 100; i++) {
      await captureSSRSnapshot(Complex);
    }
  });

  bench('100 large tree SSRs (behavioral)', async () => {
    // Larger tree to exercise recursion and allocation costs
    const Large = () => ({
      type: 'div',
      children: Array.from({ length: 500 }, (_, i) => ({
        type: 'section',
        props: { key: String(i) },
        children: [
          { type: 'h2', children: [String(i)] },
          { type: 'p', children: ['Lorem ipsum dolor sit amet.'] },
        ],
      })),
    });
    for (let i = 0; i < 100; i++) {
      await captureSSRSnapshot(Large);
    }
  });
});
