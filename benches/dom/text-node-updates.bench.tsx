import { bench, describe } from 'vitest';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';
import { createIsland, state } from '../../src';
import type { State } from '../../src';

describe('text node updates', () => {
  bench('100 text updates', async () => {
    const { container, cleanup } = createTestContainer();

    let count: State<number> | null = null;

    const Component = () => {
      count = state(0);
      return <div>Count: {count()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    for (let i = 0; i < 100; i++) {
      count!.set(i);
    }
    flushScheduler();

    cleanup();
  });

  bench('100 bulk text updates', async () => {
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

    createIsland({ root: container, component: Component });
    flushScheduler();

    for (let i = 0; i < 100; i++) {
      items!.set(items!().map((x) => x + 1));
    }
    flushScheduler();

    cleanup();
  });

  bench('100 text toggles', async () => {
    const { container, cleanup } = createTestContainer();

    let text: State<string> | null = null;

    const Component = () => {
      text = state('Hello');
      return <p>{text()}</p>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    for (let i = 0; i < 100; i++) {
      text!.set(text!() === 'Hello' ? 'World' : 'Hello');
    }
    flushScheduler();

    cleanup();
  });

  bench('200 bulk updates (large)', async () => {
    const { container, cleanup } = createTestContainer();

    let items: State<number[]> | null = null;

    const Component = () => {
      items = state(Array.from({ length: 200 }, (_, i) => i));

      return (
        <ul>
          {items().map((item) => (
            <li key={item}>Item {item} - some long text</li>
          ))}
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    for (let i = 0; i < 100; i++) {
      items!.set(items!().map((x) => x + 1));
    }
    flushScheduler();

    cleanup();
  });
});
