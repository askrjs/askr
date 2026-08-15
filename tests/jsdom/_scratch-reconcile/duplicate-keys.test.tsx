import { expect, test } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';

test('duplicate keys in the same list', () => {
  const { container, cleanup } = createTestContainer();
  let rows!: ReturnType<typeof state<Array<{ id: number; label: string }>>>;

  const Component = () => {
    rows = state([
      { id: 1, label: 'a' },
      { id: 1, label: 'b' },
      { id: 2, label: 'c' },
    ]);
    return (
      <ul>
        <For each={rows} by={(item) => item.id}>
          {(item) => <li>{item.label}</li>}
        </For>
      </ul>
    );
  };

  let threw: unknown = null;
  try {
    createIsland({ root: container, component: Component });
    flushScheduler();
  } catch (error) {
    threw = error;
  }

  console.log('duplicate key initial render threw:', threw);
  console.log('DOM after initial:', container.innerHTML);

  cleanup();
});
