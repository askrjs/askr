import { expect, test } from 'vite-plus/test';
import { createIsland } from '@askrjs/askr/boot';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';

test('should not emit wrapper element for For boundary', () => {
  const { container, cleanup } = createTestContainer();

  const Component = () => {
    const rows = [1, 2, 3];
    return (
      <div class={'wrap'}>
        {
          <For each={() => rows} by={(n) => n}>
            {(n) => <div>{String(n)}</div>}
          </For>
        }
      </div>
    );
  };

  createIsland({ root: container, component: Component });

  // Range anchors are implementation detail; the list items themselves must
  // remain direct children of the authored wrapper with their typed keys.
  const wrapper = container.querySelector('.wrap')!;
  expect(Array.from(wrapper.children).map((child) => child.outerHTML)).toEqual([
    '<div data-key="1" data-askr-key-kind="number">1</div>',
    '<div data-key="2" data-askr-key-kind="number">2</div>',
    '<div data-key="3" data-askr-key-kind="number">3</div>',
  ]);

  cleanup();
});
