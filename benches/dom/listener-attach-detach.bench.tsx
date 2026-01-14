import { bench, describe } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('listener attach detach', () => {
  bench('1 listener', () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const count = state(0);
      return <button onClick={() => count.set(count() + 1)}>Click</button>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    cleanup();
  });

  bench('100 listeners', () => {
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

    createIsland({ root: container, component: Component });
    flushScheduler();
    cleanup();
  });
});
