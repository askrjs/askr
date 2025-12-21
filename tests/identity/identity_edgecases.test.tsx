import { describe, it, expect } from 'vitest';
import { state, createApp } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('identity edge cases', () => {
  it('should deterministically reuse prior DOM nodes for duplicate keys (no ambiguous remounts)', async () => {
    const { container, cleanup } = createTestContainer();

    let items: ReturnType<
      typeof state<Array<{ key: string; label: string }>>
    > | null = null;

    const Component = () => {
      items = state([
        { key: 'a', label: 'A1' },
        { key: 'a', label: 'A2' },
        { key: 'b', label: 'B' },
      ]);

      return {
        type: 'div',
        children: items().map((it, i) => ({
          type: 'div',
          // reuse the provided key (duplicate intentionally)
          key: it.key,
          props: { 'data-key': it.key, 'data-pos': String(i) },
          children: [it.label],
        })),
      };
    };

    createApp({ root: container, component: Component });
    flushScheduler();

    const aNodesBefore = Array.from(container.querySelectorAll('[data-key="a"]'));
    expect(aNodesBefore.length).toBe(2);
    const firstA_before = aNodesBefore[0];
    const secondA_before = aNodesBefore[1];

    // Swap the two occurrences in the list
    items!.set([
      { key: 'a', label: 'A2' },
      { key: 'a', label: 'A1' },
      { key: 'b', label: 'B' },
    ]);
    flushScheduler();

    const aNodesAfter = Array.from(container.querySelectorAll('[data-key="a"]'));
    expect(aNodesAfter.length).toBe(2);
    const firstA_after = aNodesAfter[0];
    const secondA_after = aNodesAfter[1];

    // Behavior: the runtime deterministically reuses prior DOM nodes when keys
    // collide. In the current implementation both prior DOM nodes are reused
    // and simply moved into their new positions (no remounts for the duplicates).
    const oldSet = new Set([firstA_before, secondA_before]);
    const preservedCount = [firstA_after, secondA_after].filter((n) =>
      oldSet.has(n)
    ).length;
    expect(preservedCount).toBe(2);

    // We do not assert a particular label mapping when keys collide (labels may be
    // reassigned during reconciliation); we assert deterministic reuse of the
    // prior DOM nodes instead (both prior nodes should be present in the new
    // children for this duplicate-key case).
    expect(container.querySelectorAll('[data-key="a"]').length).toBe(2);

    cleanup();
  });

  it('should preserve keyed identity and positional identity for mixed keyed/unkeyed siblings', async () => {
    const { container, cleanup } = createTestContainer();

    // Represent the three children explicitly so we can toggle/reorder them
    let mode: ReturnType<
      typeof state<Array<{ type: 'k' | 'u'; key?: string; label: string }>>
    > | null = null;

    const Component = () => {
      mode = state([
        { type: 'k', key: 'a', label: 'KA' },
        { type: 'u', label: 'U' },
        { type: 'k', key: 'b', label: 'KB' },
      ]);

      return {
        type: 'div',
        children: mode().map((it, i) => {
          if (it.type === 'k') {
            return {
              type: 'span',
              key: it.key,
              props: { 'data-key': it.key, 'data-label': it.label },
              children: [it.label],
            };
          }
          return {
            type: 'span',
            // mark unkeyed element with a stable attribute to find it
            props: { 'data-unkey': 'middle', 'data-label': it.label },
            children: [it.label],
          };
        }),
      };
    };

    createApp({ root: container, component: Component });
    flushScheduler();

    const keyA_before = container.querySelector('[data-key="a"]');
    const unkey_before = container.querySelector('[data-unkey="middle"]');
    const keyB_before = container.querySelector('[data-key="b"]');

    expect(keyA_before).toBeTruthy();
    expect(unkey_before).toBeTruthy();
    expect(keyB_before).toBeTruthy();

    // 1) Swap keyed 'a' and the unkeyed element
    mode!.set([
      { type: 'u', label: 'U' },
      { type: 'k', key: 'a', label: 'KA' },
      { type: 'k', key: 'b', label: 'KB' },
    ]);
    flushScheduler();

    const keyA_afterSwap = container.querySelector('[data-key="a"]');
    const unkey_afterSwap = container.querySelector('[data-unkey="middle"]');
    const keyB_afterSwap = container.querySelector('[data-key="b"]');

    // Keyed nodes keep identity by key
    expect(keyA_afterSwap).toBe(keyA_before);
    expect(keyB_afterSwap).toBe(keyB_before);

    // Unkeyed node preserves its identity positionally relative to other unkeyed nodes
    // (here it's the same single unkeyed node, so we expect the same element)
    expect(unkey_afterSwap).toBe(unkey_before);

    // 2) Insert a new keyed node at the front; this should not steal the unkeyed node
    mode!.set([
      { type: 'k', key: 'c', label: 'KC' },
      { type: 'u', label: 'U' },
      { type: 'k', key: 'a', label: 'KA' },
      { type: 'k', key: 'b', label: 'KB' },
    ]);
    flushScheduler();

    const unkey_afterInsert = container.querySelector('[data-unkey="middle"]');
    // Unkeyed element should still be the same DOM node (positional among unkeyed nodes)
    expect(unkey_afterInsert).toBe(unkey_before);

    // Keyed identity remains strict by key
    expect(container.querySelector('[data-key="a"]')).toBe(keyA_before);
    expect(container.querySelector('[data-key="b"]')).toBe(keyB_before);

    cleanup();
  });
});
