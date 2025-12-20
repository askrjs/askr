/**
 * Full replace benchmark
 *
 * Measures the cost of completely replacing a component tree.
 * Validates worst-case performance bounds.
 */

import { bench, describe } from 'vitest';
import { createApp, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

describe('full replace', () => {
  bench('small tree replacement', async () => {
    const { container, cleanup } = createTestContainer();

    let toggleStructure: (() => void) | null = null;

    const Component = () => {
      const structureType = state('structure1');
      toggleStructure = () =>
        structureType.set(
          structureType() === 'structure1' ? 'structure2' : 'structure1'
        );

      if (structureType() === 'structure1') {
        return {
          type: 'div',
          children: [
            { type: 'h1', children: ['Structure 1'] },
            { type: 'p', children: ['First paragraph'] },
            {
              type: 'ul',
              children: [
                { type: 'li', children: ['Item 1'] },
                { type: 'li', children: ['Item 2'] },
              ],
            },
          ],
        };
      } else {
        return {
          type: 'section',
          children: [
            {
              type: 'header',
              children: [{ type: 'h2', children: ['Structure 2'] }],
            },
            {
              type: 'article',
              children: [
                { type: 'p', children: ['Second paragraph'] },
                {
                  type: 'ol',
                  children: [
                    { type: 'li', children: ['Option A'] },
                    { type: 'li', children: ['Option B'] },
                  ],
                },
              ],
            },
          ],
        };
      }
    };

    createApp({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Perform full structure replacements
    for (let i = 0; i < 10; i++) {
      toggleStructure!();
      flushScheduler();
      await waitForNextEvaluation();
    }

    cleanup();
  });

  bench('large tree replacement', async () => {
    const { container, cleanup } = createTestContainer();

    let toggleLargeStructure: (() => void) | null = null;

    const Component = () => {
      const structureType = state('large1');
      toggleLargeStructure = () =>
        structureType.set(structureType() === 'large1' ? 'large2' : 'large1');

      const createLargeTree = (prefix: string) => ({
        type: 'div',
        children: Array.from({ length: 50 }, (_, i) => ({
          type: 'div',
          props: { 'data-index': i, key: String(i) },
          children: [
            { type: 'span', children: [`${prefix} Item ${i}`] },
            { type: 'p', children: [`Description ${i}`] },
          ],
        })),
      });

      return structureType() === 'large1'
        ? createLargeTree('First')
        : createLargeTree('Second');
    };

    createApp({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Perform large tree replacements
    for (let i = 0; i < 5; i++) {
      toggleLargeStructure!();
      flushScheduler();
      await waitForNextEvaluation();
    }

    cleanup();
  });

  bench('state churn (multiple updates)', async () => {
    const { container, cleanup } = createTestContainer();

    let updateState: (() => void) | null = null;
    let tick = 0;

    const Component = () => {
      const counter1 = state(0);
      const counter2 = state(0);
      const counter3 = state(0);
      const text1 = state('text1');
      const text2 = state('text2');
      const flag = state(false);

      updateState = () => {
        counter1.set(++tick % 100);
        counter2.set(++tick % 100);
        counter3.set(++tick % 100);
        text1.set(`reset-${++tick}`);
        text2.set(`reset-${++tick}`);
        flag.set(!flag());
      };

      return {
        type: 'div',
        children: [
          `Counter1: ${counter1()}`,
          `Counter2: ${counter2()}`,
          `Counter3: ${counter3()}`,
          `Text1: ${text1()}`,
          `Text2: ${text2()}`,
          `Flag: ${flag()}`,
        ],
      };
    };

    createApp({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Perform state updates
    for (let i = 0; i < 10; i++) {
      updateState!();
      flushScheduler();
      await waitForNextEvaluation();
    }

    cleanup();
  });
});
