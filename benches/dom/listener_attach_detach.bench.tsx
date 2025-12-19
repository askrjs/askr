/**
 * Tier: Framework / Transactional
 * Scenario: listener-attach
 * Includes: event handler attachment/removal via component mount/unmount and state changes
 * Excludes: pure DOM-only listener microbench (no framework lifecycle)
 */

import { bench, describe } from 'vitest';
import { createApp, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../tests/helpers/test_renderer';

describe('listener attach detach', () => {
  bench('framework::listener-attach::1::behavioral', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const count = state(0);

      return <button onClick={() => count.set(count() + 1)}>Click</button>;
    };

    createApp({ root: container, component: Component });
    flushScheduler(); // Attaches single listener
    await waitForNextEvaluation();

    cleanup(); // Detaches listener
  });

  bench('framework::listener-attach::100::behavioral', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const counts = state(Array(100).fill(0));

      return (
        <div>
          {counts().map((_, i) => (
            <button
              key={i}
              onClick={() => {
                const next = [...counts()];
                next[i]++;
                counts.set(next);
              }}
            >
              Button {i}
            </button>
          ))}
        </div>
      );
    };

    createApp({ root: container, component: Component });
    flushScheduler(); // Attaches 100 listeners
    await waitForNextEvaluation();

    cleanup(); // Detaches all listeners
  });

  bench('framework::listener-attach::1::detach-behavioral', async () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const count = state(0);

      return <button onClick={() => count.set(count() + 1)}>Click</button>;
    };

    createApp({ root: container, component: Component });
    flushScheduler(); // Attaches listener
    await waitForNextEvaluation();

    cleanup(); // Measures cleanup cost including listener detachment
  });
});
