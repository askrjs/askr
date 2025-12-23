import { it, describe, expect } from 'vitest';
import { createIsland, state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test-renderer';

describe('fast-lane DOM commit count', () => {
  it('should perform exactly one DOM replace during a reorder-only fast-lane commit', async () => {
    const ctx = createTestContainer();
    const container = ctx.container;
    const cleanup = ctx.cleanup;

    let items!: State<Array<{ id: number; text: string }>>;

    const Component = () => {
      items = state(
        Array.from({ length: 200 }, (_, i) => ({
          id: i + 1,
          text: `Item ${i + 1}`,
        }))
      );
      return {
        type: 'ul',
        children: items().map((item) => ({
          type: 'li',
          key: item.id,
          props: { 'data-key': String(item.id) },
          children: [item.text],
        })),
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();

    const gBefore =
      (
        globalThis as unknown as Record<string, unknown> & {
          __ASKR__?: Record<string, unknown>;
        }
      ).__ASKR__ || {};
    const before =
      typeof (gBefore as Record<string, unknown>)['__DOM_REPLACE_COUNT'] ===
      'number'
        ? ((gBefore as Record<string, unknown>)[
            '__DOM_REPLACE_COUNT'
          ] as number)
        : 0;

    // Trigger a large reorder-only update to exercise runtime fast-lane
    items.set([...items()].reverse());
    flushScheduler();
    await waitForNextEvaluation();

    const gAfter =
      (
        globalThis as unknown as Record<string, unknown> & {
          __ASKR__?: Record<string, unknown>;
        }
      ).__ASKR__ || {};
    const after =
      typeof (gAfter as Record<string, unknown>)['__DOM_REPLACE_COUNT'] ===
      'number'
        ? ((gAfter as Record<string, unknown>)['__DOM_REPLACE_COUNT'] as number)
        : 0;

    expect(after - before).toBe(1);

    cleanup();
  });
});
