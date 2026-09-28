import { describe, expect, it } from 'vite-plus/test';
import { For } from '@askrjs/askr/control';
import { state } from '../../../src';
import { task } from '../../../src/resources';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('For comment host cleanup', () => {
  it('should dispose a removed single comment-host row exactly once', () => {
    const { container, cleanup } = createTestContainer();
    let rows!: ReturnType<typeof state<number[]>>;
    let shared!: ReturnType<typeof state<number>>;
    let cleanupCount = 0;
    let readerRenders = 0;

    const NullReader = () => {
      readerRenders += 1;
      shared();
      task(() => () => {
        cleanupCount += 1;
      });
      return null;
    };

    const App = () => {
      rows = state([1]);
      shared = state(0);
      return (
        <For each={rows} by={(row) => row}>
          {() => <NullReader />}
        </For>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      expect(readerRenders).toBe(1);

      rows.set([]);
      flushScheduler();

      expect(cleanupCount).toBe(1);
      shared.set(1);
      flushScheduler();
      expect(readerRenders).toBe(1);

      rows.set([1]);
      flushScheduler();
      rows.set([]);
      flushScheduler();

      expect(cleanupCount).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('should dispose a comment-host component inside a removed row range', () => {
    const { container, cleanup } = createTestContainer();
    let rows!: ReturnType<typeof state<number[]>>;
    let shared!: ReturnType<typeof state<number>>;
    let cleanupCount = 0;
    let readerRenders = 0;

    const NullReader = () => {
      readerRenders += 1;
      shared();
      task(() => () => {
        cleanupCount += 1;
      });
      return null;
    };

    const App = () => {
      rows = state([1]);
      shared = state(0);
      return (
        <section>
          <For each={rows} by={(row) => row}>
            {(row) => (
              <>
                <span data-row={row}>{row}</span>
                <NullReader />
              </>
            )}
          </For>
        </section>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      expect(readerRenders).toBe(1);

      rows.set([]);
      flushScheduler();

      expect(container.querySelector('[data-row]')).toBeNull();
      expect(cleanupCount).toBe(1);
      shared.set(1);
      flushScheduler();
      expect(readerRenders).toBe(1);
    } finally {
      cleanup();
    }
  });
});
