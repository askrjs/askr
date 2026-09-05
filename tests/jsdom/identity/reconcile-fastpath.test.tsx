import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { DIRECT_REPLACE_CHILDREN_SPREAD_LIMIT } from '../../../src/renderer/utils';
import {
  disableEventDelegation,
  enableEventDelegation,
} from '../../../src/renderer/events';

describe('reconcile keyed children fast-path', () => {
  let container: HTMLElement, cleanup: () => void;

  beforeEach(() => {
    const r = createTestContainer();
    container = r.container;
    cleanup = r.cleanup;
  });

  afterEach(() => {
    cleanup();
    enableEventDelegation();
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

      return (
        <div>
          {items().map((item) => (
            <div
              key={item.id}
              data-key={String(item.id)}
              onClick={() => {
                clicks.set(item.id, (clicks.get(item.id) || 0) + 1);
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const idToCheck = 10;
    const beforeElem = container.querySelector(
      `[data-key="${idToCheck}"]`
    )! as HTMLElement;
    expect(beforeElem).toBeTruthy();

    let nativeClicks = 0;
    beforeElem.addEventListener('click', () => {
      nativeClicks++;
    });

    // Trigger click once
    beforeElem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks.get(idToCheck)).toBe(1);
    expect(nativeClicks).toBe(1);

    // Perform a large reorder (reverse)
    const reversed = [...items!()].reverse();

    // Spy on parent's replaceChildren to assert the fast-path was used
    const parent = container.querySelector('div')!;
    const replaceSpy = vi.spyOn(parent, 'replaceChildren');

    items!.set(reversed);
    flushScheduler();

    expect(replaceSpy).toHaveBeenCalled();
    const replaceCall = replaceSpy.mock.calls.at(-1)!;
    expect(replaceCall.length).toBe(200);
    expect(replaceCall[0]).not.toBeInstanceOf(DocumentFragment);

    const afterElem = container.querySelector(
      `[data-key="${idToCheck}"]`
    )! as HTMLElement;
    expect(afterElem).toBeTruthy();

    // Identity preserved (same Element instance)
    expect(afterElem).toBe(beforeElem);

    // Click again and ensure listener still works
    afterElem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks.get(idToCheck)).toBe(2);
    expect(nativeClicks).toBe(2);

    expect(
      Array.from(parent.children, (child) => child.getAttribute('data-key'))
    ).toEqual(reversed.map((item) => String(item.id)));

    // Restore spies
    replaceSpy.mockRestore();
  });

  it('should clean removed keyed nodes without cleaning reused nodes', async () => {
    disableEventDelegation();

    let items: ReturnType<typeof state<Array<{ id: number }>>> | null = null;
    const clicks = new Map<number, number>();
    const bumpRowState = new Map<number, () => void>();

    const RowState = ({ id }: { id: number }) => {
      const local = state(0);
      bumpRowState.set(id, () => local.set((value) => value + 1));

      return <span data-count={String(id)}>{() => `${id}:${local()}`}</span>;
    };

    const Component = () => {
      items = state([{ id: 1 }, { id: 2 }, { id: 3 }]);

      return (
        <div>
          {items().map((item) => (
            <button
              key={item.id}
              data-key={String(item.id)}
              onClick={() => {
                clicks.set(item.id, (clicks.get(item.id) ?? 0) + 1);
              }}
            >
              <RowState id={item.id} />
            </button>
          ))}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const removedElem = container.querySelector(
      '[data-key="2"]'
    ) as HTMLButtonElement;
    const reusedElem = container.querySelector(
      '[data-key="3"]'
    ) as HTMLButtonElement;

    removedElem.click();
    reusedElem.click();
    flushScheduler();

    expect(clicks.get(2)).toBe(1);
    expect(clicks.get(3)).toBe(1);
    expect(removedElem.textContent).toBe('2:0');

    items!.set([{ id: 3 }, { id: 1 }]);
    flushScheduler();

    const reusedAfter = container.querySelector(
      '[data-key="3"]'
    ) as HTMLButtonElement;
    expect(container.querySelector('[data-key="2"]')).toBeNull();
    expect(reusedAfter).toBe(reusedElem);

    removedElem.click();
    reusedAfter.click();
    flushScheduler();

    expect(clicks.get(2)).toBe(1);
    expect(clicks.get(3)).toBe(2);

    bumpRowState.get(2)!();
    bumpRowState.get(3)!();
    flushScheduler();

    expect(removedElem.textContent).toBe('2:0');
    expect(reusedAfter.textContent).toBe('3:1');
  });

  it(
    'should use the fragment path above the direct spread threshold',
    { timeout: 20000 },
    async () => {
      const count = DIRECT_REPLACE_CHILDREN_SPREAD_LIMIT + 1;
      let items: ReturnType<
        typeof state<Array<{ id: number; label: string }>>
      > | null = null;

      const Component = () => {
        items = state(
          Array.from({ length: count }, (_, i) => ({
            id: i + 1,
            label: `Item ${i + 1}`,
          }))
        );

        return (
          <div>
            {items().map((item) => (
              <div key={item.id} data-key={String(item.id)}>
                {item.label}
              </div>
            ))}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const idToCheck = 1024;
      const beforeElem = container.querySelector(
        `[data-key="${idToCheck}"]`
      )! as HTMLElement;
      const parent = container.querySelector('div')!;
      const replaceSpy = vi.spyOn(parent, 'replaceChildren');
      const reversed = [...items!()].reverse();

      items!.set(reversed);
      flushScheduler();

      expect(replaceSpy).toHaveBeenCalled();
      const replaceCall = replaceSpy.mock.calls.at(-1)!;
      expect(replaceCall.length).toBe(1);
      expect(replaceCall[0]).toBeInstanceOf(DocumentFragment);

      const afterElem = container.querySelector(
        `[data-key="${idToCheck}"]`
      )! as HTMLElement;
      expect(afterElem).toBe(beforeElem);
      expect(parent.firstElementChild?.getAttribute('data-key')).toBe(
        String(count)
      );
      expect(parent.lastElementChild?.getAttribute('data-key')).toBe('1');

      replaceSpy.mockRestore();
    }
  );
});
