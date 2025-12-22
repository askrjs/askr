/**
 * Initial render benchmark
 *
 * Measures the cost of first-time component rendering and DOM creation.
 */

import { bench, describe } from 'vitest';
import { createIsland } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

// Component definitions outside benches for determinism
const EmptyComponent = () => ({ type: 'div', children: [] });

const SimpleComponent = () => ({
  type: 'div',
  children: [
    { type: 'h1', children: ['Hello World'] },
    { type: 'p', children: ['This is a simple component'] },
  ],
});

const ComplexComponent = () => ({
  type: 'div',
  children: [
    {
      type: 'header',
      children: [
        { type: 'h1', children: ['Complex App'] },
        {
          type: 'nav',
          children: [
            {
              type: 'ul',
              children: [
                {
                  type: 'li',
                  children: [
                    { type: 'a', props: { href: '#' }, children: ['Home'] },
                  ],
                },
                {
                  type: 'li',
                  children: [
                    {
                      type: 'a',
                      props: { href: '#' },
                      children: ['About'],
                    },
                  ],
                },
                {
                  type: 'li',
                  children: [
                    {
                      type: 'a',
                      props: { href: '#' },
                      children: ['Contact'],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'main',
      children: [
        {
          type: 'section',
          children: [
            { type: 'h2', children: ['Section 1'] },
            {
              type: 'p',
              children: [
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              ],
            },
            {
              type: 'p',
              children: [
                'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
              ],
            },
          ],
        },
        {
          type: 'section',
          children: [
            { type: 'h2', children: ['Section 2'] },
            {
              type: 'p',
              children: [
                'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
              ],
            },
            {
              type: 'ul',
              children: [
                { type: 'li', children: ['Item 1'] },
                { type: 'li', children: ['Item 2'] },
                { type: 'li', children: ['Item 3'] },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'footer',
      children: [{ type: 'p', children: ['© 2024 Complex App'] }],
    },
  ],
});

describe('initial render', () => {
  bench('scheduler flush (noop)', async () => {
    flushScheduler();
    await waitForNextEvaluation();
  });

  bench('empty container noop', async () => {
    const { container: _container, cleanup } = createTestContainer();
    flushScheduler();
    await waitForNextEvaluation();
    cleanup();
  });

  bench('empty component (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    createIsland({ root: container, component: EmptyComponent });
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });

  bench('simple component (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    createIsland({ root: container, component: SimpleComponent });
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });

  bench('complex component tree (behavioral)', async () => {
    const { container, cleanup } = createTestContainer();

    createIsland({ root: container, component: ComplexComponent });
    flushScheduler();
    await waitForNextEvaluation();

    cleanup();
  });
});
