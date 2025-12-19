import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state, createApp } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('reconcile keyed children fast-path', () => {
  let container: HTMLElement, cleanup: () => void;

  beforeEach(() => {
    const r = createTestContainer();
    container = r.container;
    cleanup = r.cleanup;
  });

  afterEach(() => {
    cleanup();
    // Restore any spies/mocks registered during the test
    if (typeof vi !== 'undefined') vi.restoreAllMocks();
  });

  it('should preserve DOM identity and event listeners for large reorders', async () => {
    let items: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const clicks = new Map<number, number>();

    const Component = () => {
      items = state(
        Array.from({ length: 200 }, (_, i) => ({
          id: i + 1,
          label: `Item ${i + 1}`,
        }))
      );

      return {
        type: 'div',
        children: items().map((item) => ({
          type: 'div',
          key: item.id,
          props: {
            'data-key': String(item.id),
            onClick: () => {
              clicks.set(item.id, (clicks.get(item.id) || 0) + 1);
            },
          },
          children: [item.label],
        })),
      };
    };

    createApp({ root: container, component: Component });
    flushScheduler();

    const idToCheck = 10;
    const beforeElem = container.querySelector(
      `[data-key="${idToCheck}"]`
    )! as HTMLElement;
    expect(beforeElem).toBeTruthy();

    // Trigger click once
    beforeElem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks.get(idToCheck)).toBe(1);

    // Perform a large reorder (reverse)
    const reversed = [...items!()].reverse();

    // Spy on parent's replaceChildren to assert the fast-path was used
    const parent = container.querySelector('div')!;
    const replaceSpy = vi.spyOn(parent, 'replaceChildren');

    items!.set(reversed);
    flushScheduler();

    expect(replaceSpy).toHaveBeenCalled();

    const afterElem = container.querySelector(
      `[data-key="${idToCheck}"]`
    )! as HTMLElement;
    expect(afterElem).toBeTruthy();

    // Identity preserved (same Element instance)
    expect(afterElem).toBe(beforeElem);

    // Click again and ensure listener still works
    afterElem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks.get(idToCheck)).toBe(2);

    // Restore spies
    replaceSpy.mockRestore();
  });
});
