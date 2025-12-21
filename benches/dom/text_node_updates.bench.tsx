/**
 * Tier: Framework / Transactional
 * Scenario: text-node-updates
 * Includes: state mutation, reconciliation of text nodes, scheduler flush
 * Excludes: pure DOM text node microbench (if you need that, see dom::replacefragment)
 */

import { bench, describe } from 'vitest';
import { createApp, State, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
  trackDOMMutations,
} from '../../tests/helpers/test_renderer';

describe('text node updates', () => {
  bench(
    'framework::text-node-updates::100::batched-state-mutations',
    async () => {
      const { container, cleanup } = createTestContainer();

      let count: State<number> | null = null;

      const Component = () => {
        count = state(0);

        return <div>Count: {count()}</div>;
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();

      // Perform text updates
      for (let i = 0; i < 100; i++) {
        count!.set(i);
      }
      flushScheduler();
      await waitForNextEvaluation();

      cleanup();
    }
  );

  bench(
    'framework::text-node-updates::100::batched-state-mutations-bulk',
    async () => {
      const { container, cleanup } = createTestContainer();

      let items: State<number[]> | null = null;

      const Component = () => {
        items = state([1, 2, 3, 4, 5]);

        return (
          <ul>
            {items().map((item) => (
              <li key={item}>Item {item}</li>
            ))}
          </ul>
        );
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();

      // Perform bulk text updates
      for (let i = 0; i < 100; i++) {
        items!.set(items!().map((x) => x + 1));
      }
      flushScheduler();
      await waitForNextEvaluation();

      cleanup();
    }
  );

  bench(
    'framework::text-node-updates::100::batched-state-mutations-toggles',
    async () => {
      const { container, cleanup } = createTestContainer();

      let text: State<string> | null = null;

      const Component = () => {
        text = state('Hello');

        return <p>{text()}</p>;
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();

      // Perform text content changes
      for (let i = 0; i < 100; i++) {
        text!.set(text!() === 'Hello' ? 'World' : 'Hello');
      }
      flushScheduler();
      await waitForNextEvaluation();

      cleanup();
    }
  );

  // Instrumented variant: record DOM mutation counts for the bulk update path
  bench(
    'framework::text-node-updates::100::batched-state-mutations-bulk-instrumented',
    async () => {
      const { container, cleanup } = createTestContainer();

      let items: State<number[]> | null = null;

      const Component = () => {
        items = state([1, 2, 3, 4, 5]);

        return (
          <ul>
            {items().map((item) => (
              <li key={item}>Item {item}</li>
            ))}
          </ul>
        );
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();

      const mutations = trackDOMMutations(container, () => {
        for (let i = 0; i < 100; i++) {
          items!.set(items!().map((x) => x + 1));
        }
        flushScheduler();
      });

      await waitForNextEvaluation();

      // Instrumentation disabled: mutation counts are no longer emitted to stdout.

      cleanup();
    }
  );

  // Larger bulk variant to magnify allocation costs
  bench(
    'framework::text-node-updates::200::batched-state-mutations-bulk-large',
    async () => {
      const { container, cleanup } = createTestContainer();

      let items: State<number[]> | null = null;

      const Component = () => {
        items = state(Array.from({ length: 200 }, (_, i) => i));

        return (
          <ul>
            {items().map((item) => (
              <li key={item}>
                Item {item} - some long text to increase workload
              </li>
            ))}
          </ul>
        );
      };

      createApp({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();

      for (let i = 0; i < 100; i++) {
        items!.set(items!().map((x) => x + 1));
      }
      flushScheduler();
      await waitForNextEvaluation();

      cleanup();
    }
  );
});
