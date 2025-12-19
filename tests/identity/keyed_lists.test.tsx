/**
 * tests/identity/keyed_lists.test.ts
 *
 * SPEC 2.4: Keyed Reconciliation
 *
 * Components with explicit keys maintain identity across reorders.
 * Without keys, identity is positional.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state, createApp } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('keyed lists (SPEC 2.4)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe('key-based identity', () => {
    it('should maintain identity of keyed items when list is reordered', async () => {
      let items: ReturnType<
        typeof state<Array<{ id: number; label: string }>>
      > | null = null;

      const Component = () => {
        items = state([
          { id: 1, label: 'A' },
          { id: 2, label: 'B' },
          { id: 3, label: 'C' },
        ]);
        return {
          type: 'div',
          children: items().map((item) => ({
            type: 'div',
            key: item.id,
            props: { 'data-id': item.id },
            children: [item.label],
          })),
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();

      const firstB = container.querySelector('[data-id="2"]');
      expect(firstB?.textContent).toBe('B');

      // Reorder to [3, 1, 2]
      items!.set([
        { id: 3, label: 'C' },
        { id: 1, label: 'A' },
        { id: 2, label: 'B' },
      ]);
      flushScheduler();

      // Same element (by key) should still be present
      const secondB = container.querySelector('[data-id="2"]');
      expect(secondB?.textContent).toBe('B');
      // Should be the same DOM element (identity preserved)
      expect(firstB).toBe(secondB);
    });

    it('should lose identity of unkeyed items when list is reordered', async () => {
      let items: ReturnType<typeof state<string[]>> | null = null;

      const Component = () => {
        items = state(['A', 'B', 'C']);
        return {
          type: 'div',
          children: items().map((label, i) => ({
            type: 'div',
            props: { 'data-index': i },
            children: [label],
          })),
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();

      // Get the root div rendered by the component
      const root = container.children[0] as HTMLElement;
      // Second child of root should be the item with 'B'
      const firstSecondItem = root.children[1] as HTMLElement;
      expect(firstSecondItem?.textContent).toBe('B');

      // Reorder to ['C', 'A', 'B']
      items!.set(['C', 'A', 'B']);
      flushScheduler();

      // Second position now has 'A', not 'B'
      const secondSecondItem = root.children[1] as HTMLElement;
      expect(secondSecondItem?.textContent).toBe('A');
    });

    it('should maintain key stability across updates', async () => {
      let items: ReturnType<
        typeof state<Array<{ id: string; value: number }>>
      > | null = null;

      const Component = () => {
        items = state([
          { id: 'x', value: 10 },
          { id: 'y', value: 20 },
        ]);
        return {
          type: 'div',
          children: items().map((item) => ({
            type: 'div',
            key: item.id,
            props: { 'data-key': item.id },
            children: [`${item.value}`],
          })),
        };
      };

      createApp({ root: container, component: Component });
      flushScheduler();

      const elemX = container.querySelector('[data-key="x"]');
      expect(elemX?.textContent).toBe('10');

      // Update value without changing id
      items!.set([
        { id: 'x', value: 100 },
        { id: 'y', value: 200 },
      ]);
      flushScheduler();

      // Same element by key, updated value
      expect(container.querySelector('[data-key="x"]')?.textContent).toBe(
        '100'
      );
      expect(container.querySelector('[data-key="x"]')).toBe(elemX);
    });
  });
});
