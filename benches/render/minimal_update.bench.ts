/**
 * Minimal update benchmark
 *
 * Measures the cost of updating a single node in a large tree.
 * Validates minimal DOM mutation guarantees.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createApp, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test_renderer';

describe('minimal update', () => {
  describe('single text change', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let updateText: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const text = state('Hello');
        updateText = () => text.set(text() === 'Hello' ? 'World' : 'Hello');

        return {
          type: 'div',
          children: [
            { type: 'p', children: ['Static text'] },
            { type: 'p', children: [text()] },
            { type: 'p', children: ['More static text'] },
          ],
        };
      };

      createApp({ root: container, component: Component });
      // initial render
      flushScheduler();
      // pre-warm to stabilize shapes
      updateText!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      updateText = null;
    });

    // Kept: representative benchmark (commit). Removed baseline and transactional variants to reduce noise.
    bench('single text change (commit)', () => {
      updateText!();
      flushScheduler();
    });
  });

  describe('single attribute change', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let toggleClass: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const isActive = state(false);
        toggleClass = () => isActive.set(!isActive());

        return {
          type: 'div',
          children: [
            {
              type: 'button',
              props: {
                class: isActive() ? 'active' : 'inactive',
              },
              children: ['Click me'],
            },
          ],
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      // pre-warm
      toggleClass!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      toggleClass = null;
    });

    // Kept: representative benchmark (commit). Removed baseline and transactional variants to reduce noise.
    bench('single attribute change (commit)', () => {
      toggleClass!();
      flushScheduler();
    });
  });

  describe('deep tree single change', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let updateDeep: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const Component = () => {
        const deepValue = state('initial');
        updateDeep = () =>
          deepValue.set(deepValue() === 'initial' ? 'updated' : 'initial');

        // Create a deep nested structure
        return {
          type: 'div',
          children: [
            {
              type: 'section',
              children: [
                {
                  type: 'article',
                  children: [
                    {
                      type: 'header',
                      children: [
                        {
                          type: 'h1',
                          children: ['Deep Tree Test'],
                        },
                      ],
                    },
                    {
                      type: 'main',
                      children: [
                        {
                          type: 'div',
                          children: [
                            {
                              type: 'div',
                              children: [
                                {
                                  type: 'div',
                                  children: [
                                    {
                                      type: 'span',
                                      children: [deepValue()],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      // pre-warm
      updateDeep!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      updateDeep = null;
    });

    // Kept: representative benchmark (commit). Removed baseline and transactional variants to reduce noise.
    bench('deep tree single change (commit)', () => {
      updateDeep!();
      flushScheduler();
    });
  });
});
