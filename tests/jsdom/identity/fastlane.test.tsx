import { describe, it, beforeAll, afterAll, expect } from 'vite-plus/test';
import { state } from '../../../src/index';
import type { State } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';
import { queueTask } from '../../../src/core/reactive/scheduler';
import { createIsland } from '../../../test-utils/render/create-island';

/*
 Consolidated fast-lane tests
 - fastlane.test.ts (runtime fast-lane behavior)
 - fastlane_large_reorder_regression.test.ts (large reorder hang regression)
 - fastlane_scheduler_progress.test.ts (scheduler progress escape during fast-lane)
*/

describe('runtime fast-lane', () => {
  describe('activates for large keyed reorders', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items!: State<Array<{ id: number; text: string }>>;
    let originalNodes: Map<string, Element>;

    beforeAll(async () => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state(
          Array.from({ length: 200 }, (_, i) => ({
            id: i + 1,
            text: `Item ${i + 1}`,
          }))
        );
        return (
          <ul>
            {items().map((item) => (
              <li key={item.id} data-key={String(item.id)}>
                {item.text}
              </li>
            ))}
          </ul>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
      originalNodes = new Map(
        Array.from(container.querySelectorAll('li'), (node) => [
          node.getAttribute('data-key')!,
          node,
        ])
      );
    });

    it('should preserve keyed nodes on a large pathological reorder', async () => {
      // Rearrange: reverse and shuffle to ensure pathological movement
      items.set([...items()].reverse());
      flushScheduler();
      await waitForNextEvaluation();

      const nodes = Array.from(container.querySelectorAll('li'));
      expect(nodes.map((node) => node.getAttribute('data-key'))).toEqual(
        items().map((item) => String(item.id))
      );
      expect(nodes).toHaveLength(200);
      for (const node of nodes) {
        expect(node).toBe(originalNodes.get(node.getAttribute('data-key')!));
      }
    });

    afterAll(() => cleanup());
  });

  describe('does not activate when props change', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let items!: State<Array<{ id: number; text: string; togg: number }>>;

    beforeAll(async () => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        items = state(
          Array.from({ length: 200 }, (_, i) => ({
            id: i + 1,
            text: `Item ${i + 1}`,
            togg: i % 2,
          }))
        );
        return (
          <ul>
            {items().map((item) => (
              <li
                key={item.id}
                data-key={String(item.id)}
                class={String(item.togg)}
              >
                {item.text}
              </li>
            ))}
          </ul>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      await waitForNextEvaluation();
    });

    it('should apply prop changes during a keyed reorder', async () => {
      // Reverse order AND mutate props for the same keys.
      items.set(
        [...items()].reverse().map((item) => ({
          ...item,
          togg: item.togg ^ 1,
        }))
      );
      flushScheduler();
      await waitForNextEvaluation();

      const nodes = Array.from(container.querySelectorAll('li'));
      expect(nodes.map((node) => node.getAttribute('data-key'))).toEqual(
        items().map((item) => String(item.id))
      );
      expect(nodes.map((node) => node.className)).toEqual(
        items().map((item) => String(item.togg))
      );
    });

    afterAll(() => cleanup());
  });
});

// Large reorder regression test: ensure no hang
describe('fast-lane large reorder regression', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items: State<number[]>;
  const N = 2000; // large enough to reproduce previous hang but small enough for CI

  beforeAll(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;

    const Component = () => {
      items = state(Array.from({ length: N }, (_, i) => i));
      return (
        <ul>
          {items().map((item: number) => (
            <li key={item} data-key={String(item)}>
              {'Item ' + item}
            </li>
          ))}
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
  });

  it(
    'should complete large fast-lane reorder without hanging',
    { timeout: 15000 },
    async () => {
      await waitForNextEvaluation();

      // Perform large keys-shift which previously could cause a hang
      items.set(items().map((x: number) => x + 1));
      flushScheduler();

      await waitForNextEvaluation();

      const afterEls = Array.from(container.querySelectorAll('li'));
      expect(afterEls.length).toBe(N);

      expect(afterEls[0]?.getAttribute('data-key')).toBe('1');
      expect(afterEls.at(-1)?.getAttribute('data-key')).toBe(String(N));
    }
  );

  afterAll(() => {
    cleanup();
  });
});

// Scheduler progress escape hatch test
describe('fast-lane scheduler progress escape hatch', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items: State<Array<{ id: number; text: string }>>;

  beforeAll(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;
  });

  it('should allow synchronous scheduler progress during fast-lane commit', async () => {
    let marker = false;

    const Component = () => {
      items = state(
        Array.from({ length: 200 }, (_, i) => ({
          id: i + 1,
          text: `Item ${i + 1}`,
        }))
      );

      queueTask(() => {
        marker = true;
      });

      return (
        <ul>
          {items().map((item: { id: number; text: string }) => (
            <li key={item.id} data-key={String(item.id)}>
              {item.text}
            </li>
          ))}
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    // Trigger a pathological reorder to exercise the fast-lane path
    items.set([...items()].reverse());

    // flush and await completion; previously this would hang
    flushScheduler();
    await waitForNextEvaluation();

    // The enqueued task should have executed during the scheduler flush.
    expect(marker).toBeTruthy();

    cleanup();
  });
});
