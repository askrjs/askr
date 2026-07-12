// tests/state/state_mutation_guards.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { allowFrameworkWarnings } from '../../setup-env';

describe('state mutation guards (STATE)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  it('should succeed when state.set() is called after render completes', async () => {
    let count: ReturnType<typeof state<number>> | null = null;
    const Component = () => {
      count = state(0);
      return <div>{String(count())}</div>;
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
      return <div>x</div>;
    };

    expect(() => createIsland({ root: container, component: Bad })).toThrow(
      /state\.set\(\) cannot be called during component render/i
    );
  });

  it('should leave committed subscriptions unchanged when state.set() throws during render', () => {
    allowFrameworkWarnings(
      /Unused state variable detected in Component at index 2/
    );
    let shouldWrite: ReturnType<typeof state<boolean>> | null = null;
    let first: ReturnType<typeof state<string>> | null = null;
    let second: ReturnType<typeof state<string>> | null = null;
    let renders = 0;

    const Component = () => {
      renders += 1;
      shouldWrite = state(false);
      first = state('first:0');
      second = state('second:0');

      if (shouldWrite()) {
        second();
        first.set('illegal');
      }

      return <div>{first()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(renders).toBe(1);
    expect(container.textContent).toBe('first:0');

    shouldWrite!.set(true);
    expect(() => flushScheduler()).toThrow(
      /state\.set\(\) cannot be called during component render/i
    );
    expect(renders).toBe(2);
    expect(container.textContent).toBe('first:0');

    const secondReaders = (
      second as unknown as { _readers?: Map<unknown, unknown> }
    )._readers;
    expect(secondReaders?.size ?? 0).toBe(0);

    second!.set('second:1');
    expect(() => flushScheduler()).not.toThrow();
    expect(renders).toBe(2);
    expect(container.textContent).toBe('first:0');

    const firstReaders = (
      first as unknown as { _readers?: Map<unknown, unknown> }
    )._readers;
    expect(firstReaders?.size ?? 0).toBe(1);

    first!.set('first:1');
    expect(() => flushScheduler()).toThrow(
      /state\.set\(\) cannot be called during component render/i
    );
    expect(renders).toBe(3);
    expect(container.textContent).toBe('first:0');
  });

  it('should succeed when state.set() is called in effect callback', async () => {
    let count: ReturnType<typeof state<number>> | null = null;

    const Component = () => {
      count = state(0);
      return <div>{String(count())}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    await Promise.resolve();
    expect(() => count!.set(2)).not.toThrow();
    flushScheduler();

    expect(container.textContent).toBe('2');
  });
});
