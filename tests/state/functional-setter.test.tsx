import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('state functional updater (STATE)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should apply functional updates sequentially when called multiple times', () => {
    let count: ReturnType<typeof state<number>> | null = null;
    const Component = () => {
      count = state(0);
      return { type: 'div', children: [`${count()}`] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('0');

    // Call updater multiple times synchronously
    count!.set((prev) => prev + 1);
    count!.set((prev) => prev + 1);
    count!.set((prev) => prev + 1);

    flushScheduler();
    expect(container.textContent).toBe('3');
  });

  it('should compute updater based on latest backing value immediately', () => {
    let count: ReturnType<typeof state<number>> | null = null;
    const Component = () => {
      count = state(10);
      return { type: 'div', children: [`${count()}`] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('10');

    count!.set((prev) => prev * 2);
    count!.set((prev) => prev + 5);
    flushScheduler();
    // first: 10*2=20, then +5 => 25
    expect(container.textContent).toBe('25');
  });
});
