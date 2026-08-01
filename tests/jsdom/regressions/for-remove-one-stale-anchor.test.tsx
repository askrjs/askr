import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../src/control';
import { state } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('for-remove-one-stale-anchor', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should not swap two rows when a middle item is removed and a later, non-adjacent item changes in the same update', () => {
    let rows: ReturnType<
      typeof state<Array<{ id: string; text: string; wrapped?: boolean }>>
    > | null = null;

    const initial = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
      { id: 'd', text: 'D' },
      { id: 'e', text: 'E' },
    ];

    const Component = () => {
      rows = state(initial);

      return (
        <ul>
          <For each={() => rows!()} by={(item) => item.id}>
            {(item) =>
              item.wrapped ? (
                <li>
                  <span>{item.text}</span>
                </li>
              ) : (
                <li>{item.text}</li>
              )
            }
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // Remove 'b', and independently change 'e's rendered shape (forcing the
    // renderer off the stable-patch fast path and into the general
    // syncItemDom + anchor-based insertBefore path). 'a', 'c', and 'd' keep
    // the exact same object references (untouched, not dirty) so 'e' is the
    // ONLY dirty index - a gap sits between the removed slot (1) and the
    // dirty index (now 3), which is exactly the condition that exposes a
    // stale-anchor bug (when every index from the removal onward is dirty,
    // the bug self-masks).
    const [a, , c, d, e] = initial;
    rows!.set([a, c, d, { ...e, text: 'E2', wrapped: true }]);
    flushScheduler();

    const finalKeys = Array.from(container.querySelectorAll('[data-key]')).map(
      (el) => el.getAttribute('data-key')
    );
    const finalTexts = Array.from(container.querySelectorAll('[data-key]')).map(
      (el) => el.textContent
    );

    expect(finalKeys).toEqual(['a', 'c', 'd', 'e']);
    expect(finalTexts).toEqual(['A', 'C', 'D', 'E2']);
  });
});
