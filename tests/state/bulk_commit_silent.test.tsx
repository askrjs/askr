import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIsland, state } from '../../src/index';
import { createTestContainer, flushScheduler, waitForNextEvaluation } from '../helpers/test_renderer';

describe('bulk commit silence', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items: ReturnType<typeof state<number[]>>;

  beforeAll(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;

    const Component = () => {
      items = state([1, 2, 3]);
      return {
        type: 'ul',
        children: items().map((x) => ({ type: 'li', children: [String(x)] })),
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
  });

  it('should not log or warn when a state.set() occurs during bulk commit', async () => {
    // Force bulk commit active
    const fast = (globalThis as any).__ASKR_FASTLANE;
    if (!fast) throw new Error('__ASKR_FASTLANE bridge not available in test env');

    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn');

    try {
      fast.enterBulkCommit();
      items.set(items().map((x) => x + 1));
      // No logging should occur during the bulk-commit update
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      fast.exitBulkCommit();
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }

    // The backing value should have been updated even though the DOM may not
    // reflect it synchronously until a scheduler-driven re-render occurs.
    await waitForNextEvaluation();
    expect(items()![0]).toBe(2);
  });

  afterAll(() => cleanup());
});
