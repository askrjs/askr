import { describe, it, expect, beforeAll, afterAll, vi } from 'vite-plus/test';
import { state } from '../../../src/index';
import { enterBulkCommit, exitBulkCommit } from '../../../src/runtime/fastlane';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

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
      return (
        <ul>
          {items().map((x) => (
            <li>{String(x)}</li>
          ))}
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
  });

  it('should not console.log, and should warn exactly once, when a state.set() occurs during bulk commit', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      enterBulkCommit();
      items.set(items().map((x) => x + 1));
      // No ordinary logging should occur during the bulk-commit update, but
      // a single dev-mode diagnostic warning is expected: the update is
      // silently dropped from a notification standpoint (see state.ts), so
      // a warning is the only way this is discoverable instead of failing
      // completely silently.
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toMatch(/bulk commit/i);
    } finally {
      exitBulkCommit();
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
