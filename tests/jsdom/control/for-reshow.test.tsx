import { describe, expect, it } from 'vite-plus/test';
import { For, Show, state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('For inside Show', () => {
  const initial = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ];

  it.each([
    {
      name: 'changed items',
      next: [initial[0], { id: 'b', label: 'B2' }, initial[2]],
      revision: 0,
      expected: ['A:0:0', 'B2:1:0', 'C:2:0'],
    },
    {
      name: 'changed row callback',
      next: initial,
      revision: 1,
      expected: ['A:0:1', 'B:1:1', 'C:2:1'],
    },
    {
      name: 'reordered items',
      next: [initial[2], initial[1], initial[0]],
      revision: 0,
      expected: ['C:0:0', 'B:1:0', 'A:2:0'],
    },
    {
      name: 'changed items, callback, and order',
      next: [initial[2], { id: 'b', label: 'B2' }, initial[0]],
      revision: 1,
      expected: ['C:0:1', 'B2:1:1', 'A:2:1'],
    },
  ])(
    'should render $name when re-shown in the same flush',
    ({ next, revision: nextRevision, expected }) => {
    const { container, cleanup } = createTestContainer();
    let hide: () => void = () => {};
    let reveal: () => void = () => {};
    const clicks: string[] = [];

      const Page = () => {
        const visible = state(true);
        const items = state(initial);
        const revision = state(0);
        hide = () => visible.set(false);
        reveal = () => {
          if (next !== initial) items.set(next);
          if (nextRevision) revision.set(nextRevision);
          visible.set(true);
        };
        const capturedRevision = revision();
        return (
          <Show when={visible}>
            <ul>
              <For each={items} by={(item) => item.id}>
              {(item, index) => (
                <li onClick={() => clicks.push(item.id)}>
                  {`${item.label}:${index()}:${capturedRevision}`}
                </li>
                )}
              </For>
            </ul>
          </Show>
        );
      };

      createIsland({ root: container, component: Page });
      hide();
      flushScheduler();
      expect(container.querySelectorAll('li')).toHaveLength(0);

      reveal();
      flushScheduler();
    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows.map((li) => li.textContent)).toEqual(expected);
    for (const row of rows) row.click();
    expect(clicks).toEqual(next.map((item) => item.id));
      cleanup();
    }
  );
});
