import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../src/control';
import { state } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('for-fragment-child-prop-update-remount', () => {
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

  it('should not remount a Fragment-wrapped <For> list when a sibling/parent prop update reaches it via the retained-element path', () => {
    let toggle: ReturnType<typeof state<boolean>> | null = null;

    const Component = () => {
      toggle = state(false);

      return (
        <div>
          <ul class={toggle!() ? 'on' : 'off'}>
            <>
              {
                <For
                  each={() => [
                    { id: 1, text: 'A' },
                    { id: 2, text: 'B' },
                  ]}
                  by={(item) => item.id}
                >
                  {(item) => <li>{item.text}</li>}
                </For>
              }
            </>
          </ul>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const ulBefore = container.querySelector('ul');
    const row1Before = container.querySelector('[data-key="1"]');
    const row2Before = container.querySelector('[data-key="2"]');
    expect(row1Before).not.toBeNull();
    expect(row2Before).not.toBeNull();

    // This re-renders the whole component (toggle is read at the top level),
    // producing a new <ul> vnode with a different class. The <ul> DOM element
    // itself is retained (same position/type), so its children - the
    // Fragment-wrapped <For> - go through the retained-element prop-update
    // path (updateElementFromVnode -> element-children.ts), not a top-level
    // evaluate() call.
    toggle!.set(true);
    flushScheduler();

    expect(container.querySelector('ul')).toBe(ulBefore);
    expect((container.querySelector('ul') as HTMLElement).className).toBe('on');
    expect(container.querySelector('[data-key="1"]')).toBe(row1Before);
    expect(container.querySelector('[data-key="2"]')).toBe(row2Before);
  });
});
