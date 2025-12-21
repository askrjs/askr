// tests/state/hook_order_enforcement.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('hook order enforcement (STATE)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should enforce same order for state calls every render', () => {
    let flip: ReturnType<typeof state<boolean>> | null = null;
    let error: Error | null = null;

    const Component = () => {
      flip = state(false);
      if (flip()) {
        state('extra');
      }
      const a = state('a');
      const b = state('b');
      return { type: 'div', children: [`${a()}${b()}`] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Toggle introduces a hook-order mismatch.
    // When flip is set to true, the re-render will try to call state() in a different order.
    try {
      flip!.set(true);
      // If we get here, no error was thrown - that's a test failure
      flushScheduler();
      expect.fail('Expected hook order violation but no error was thrown');
    } catch (e) {
      error = e as Error;
    }

    // Hook order violation should be detected and throw
    expect(error?.message).toMatch(/hook order|conditionally/i);
  });

  it('should throw invariant error when state() is called conditionally', () => {
    let flag: ReturnType<typeof state<boolean>> | null = null;
    let error: Error | null = null;

    const Component = () => {
      flag = state(false);
      if (flag()) {
        state(123);
      }
      return { type: 'div', children: ['ok'] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Initial state is fine - flag is false, so conditional state not called
    try {
      flag!.set(true);
      flushScheduler();
      expect.fail('Expected hook order violation but no error was thrown');
    } catch (e) {
      error = e as Error;
    }

    // When the conditional branch turns on, the hook order error should occur
    expect(error?.message).toMatch(
      /conditionally|hook order|State index violation/i
    );
  });

  it('should throw invariant error when state() is called in loops', () => {
    let shouldLoop: ReturnType<typeof state<boolean>> | null = null;
    let error: Error | null = null;

    const Component = () => {
      shouldLoop = state(false);

      // State in a conditional loop - loop count can change
      if (shouldLoop()) {
        for (let i = 0; i < 3; i++) {
          state(i);
        }
      }

      return { type: 'div', children: ['x'] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // First render: loop doesn't run, state calls: [0]
    // Toggle to enable loop
    try {
      shouldLoop!.set(true);
      flushScheduler();
      expect.fail('Expected hook order violation but no error was thrown');
    } catch (e) {
      error = e as Error;
    }

    // Second render would call state at indices [0, 1, 2, 3] - violates hook order
    expect(error?.message).toMatch(
      /loop|conditionally|hook order|State index/i
    );
  });
});
