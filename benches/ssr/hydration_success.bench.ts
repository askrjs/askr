/**
 * Hydration success benchmark
 *
 * Measures the cost of successful client-side hydration.
 */

import { bench, describe } from 'vitest';
import { renderToString, hydrate } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test_renderer';

describe('hydration success', () => {
  // Kept: representative complex hydration bench (50-item list).
  // Removed simple and incremental micro-variants to keep bench output concise.

  bench('complex hydration (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    const Complex = () => ({
      type: 'div',
      children: [
        { type: 'h1', children: ['Title'] },
        { type: 'p', children: ['Paragraph'] },
        {
          type: 'ul',
          children: Array.from({ length: 50 }, (_, i) => ({
            type: 'li',
            props: { key: String(i) },
            children: [String(i)],
          })),
        },
      ],
    });

    const html = renderToStringSync(Complex);
    container.innerHTML = html;

    await hydrate({ root: container, component: Complex });
    flushScheduler();

    cleanup();
  });
});
