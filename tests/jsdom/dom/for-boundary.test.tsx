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

  // Range anchors are implementation detail; list items remain direct
  // children of the authored wrapper.
  const wrapper = container.querySelector('.wrap')!;
  expect(Array.from(wrapper.children).map((child) => child.outerHTML)).toEqual([
    '<div>1</div>',
    '<div>2</div>',
    '<div>3</div>',
  ]);

  cleanup();
});
