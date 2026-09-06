import { describe, it, expect, beforeAll, afterAll, vi } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  beginCommitTransaction,
  commitTransaction,
} from '../../../src/runtime/transactions/access';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('transaction state replay', () => {
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

  it('should defer a state update until the transaction exits', () => {
    const logSpy = vi.spyOn(console, 'log');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const previousText = container.textContent;

    try {
      const transaction1 = beginCommitTransaction();
      transaction1.setDeferredNotifications(true);
      try {
        items.set(items().map((x) => x + 1));
        expect(container.textContent).toBe(previousText);
        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        commitTransaction(transaction1);
      }

      flushScheduler();

      expect(items()[0]).toBe(2);
      expect(container.textContent).toBe('234');
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  afterAll(() => cleanup());
});
