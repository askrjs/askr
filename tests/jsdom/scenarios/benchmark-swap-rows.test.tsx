import { expect } from 'vite-plus/test';
import { test } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';

test('should swap rows at positions 1 and 998', { timeout: 20000 }, () => {
  const { container, cleanup } = createTestContainer();

  let dataState: ReturnType<typeof state<{ id: number; label: string }[]>>;

  const Component = () => {
    dataState = state<{ id: number; label: string }[]>([]);
    dataState();

    return (
      <table>
        <tbody>
          {
            <For each={() => dataState()} by={(row) => row.id}>
              {(row) => (
                <tr>
                  <td>{String(row.id)}</td>
                  <td>{row.label}</td>
                </tr>
              )}
            </For>
          }
        </tbody>
      </table>
    );
  };

  createIsland({ root: container, component: Component });
  flushScheduler();

  // Initial data - 1000 rows
  const initialRows: { id: number; label: string }[] = [];
  for (let i = 1; i <= 1000; i++) {
    initialRows.push({ id: i, label: `Item ${i}` });
  }
  dataState.set(initialRows);
  flushScheduler();

  let tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found');

  // Verify initial order
  let rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(1000);
  expect(rows[1].querySelectorAll('td')[1].textContent).to.equal('Item 2');
  expect(rows[998].querySelectorAll('td')[1].textContent).to.equal('Item 999');

  // Store references to the actual DOM nodes to verify they move (not recreated)
  const row1DomNode = rows[1];
  const row998DomNode = rows[998];

  // Swap rows at indices 1 and 998
  dataState.set((d) => {
    const copy = d.slice();
    const tmp = copy[1];
    copy[1] = copy[998];
    copy[998] = tmp;
    return copy;
  });
  flushScheduler();

  // Verify swap occurred
  tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found after swap');
  rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(1000);

  // Position 1 should now have Item 999
  expect(rows[1].querySelectorAll('td')[1].textContent).to.equal('Item 999');

  // Position 998 should now have Item 2
  expect(rows[998].querySelectorAll('td')[1].textContent).to.equal('Item 2');

  // Verify DOM identity preserved (nodes moved, not recreated)
  expect(rows[998]).to.equal(row1DomNode);
  expect(rows[1]).to.equal(row998DomNode);

  cleanup();
});
