import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIslands, state, derive } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

describe('derive short-form (OPERATIONS)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should return derived values via function shorthand and update on state replace', () => {
    let user: ReturnType<
      typeof state<{ id: number; name: string; age: number }>
    > | null = null;

    const App = () => {
      user = state({ id: 1, name: 'Jeff', age: 42 });
      const userName = derive(() => user!().name);
      return { type: 'div', children: [`${userName}`] };
    };

    createIslands({ islands: [{ root: container, component: App }] });
    flushScheduler();
    expect(container.textContent).toBe('Jeff');

    // Replace object immutably
    user!.set((prev) => ({ ...prev, name: 'Alice' }));
    flushScheduler();
    expect(container.textContent).toBe('Alice');
  });

  it('should continue to support derive(source, map) form', () => {
    let user: ReturnType<
      typeof state<{ id: number; name: string; age: number }>
    > | null = null;

    const App = () => {
      user = state({ id: 1, name: 'Jeff', age: 42 });
      const isAdult = derive(
        () => user!(),
        (u) => u.age >= 18
      );
      return { type: 'div', children: [`${isAdult}`] };
    };

    createIslands({ islands: [{ root: container, component: App }] });
    flushScheduler();
    expect(container.textContent).toBe('true');

    user!.set((prev) => ({ ...prev, age: 15 }));
    flushScheduler();
    expect(container.textContent).toBe('false');
  });
});
