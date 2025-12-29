// tests/state/state_mutation_guards.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

describe('state mutation guards (STATE)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should succeed when state.set() is called after render completes', async () => {
    let count: ReturnType<typeof state<number>> | null = null;
    const Component = () => {
      count = state(0);
      return { type: 'div', children: [`${count()}`] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('0');

    expect(() => count!.set(1)).not.toThrow();
    flushScheduler();
    expect(container.textContent).toBe('1');
  });

  it('should throw error when state.set() is called during render', () => {
    const Bad = () => {
      const count = state(0);
      // Illegal: mutating during render should throw immediately.
      count.set(1);
      return { type: 'div', children: ['x'] };
    };

    expect(() => createIsland({ root: container, component: Bad })).toThrow(
      /state\.set\(\) cannot be called during component render/i
    );
  });

  it('should succeed when state.set() is called in effect callback', async () => {
    let count: ReturnType<typeof state<number>> | null = null;

    const Component = () => {
      count = state(0);
      return { type: 'div', children: [`${count()}`] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(() => count!.set(2)).not.toThrow();
        resolve();
      }, 0);
    });
    flushScheduler();

    expect(container.textContent).toBe('2');
  });
});
