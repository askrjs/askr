import { expect } from 'vite-plus/test';
import { test } from 'vite-plus/test';
import { createIsland, state } from '../../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';

test('should replace all 1,000 rows with new data', { timeout: 20000 }, () => {
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
                <tr key={row.id}>
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

  // Initial data
  const initialRows: { id: number; label: string }[] = [];
  for (let i = 1; i <= 1000; i++) {
    initialRows.push({ id: i, label: `Original ${i}` });
  }
  dataState.set(initialRows);
  flushScheduler();

  // Verify initial state
  let tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found');
  let rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(1000);
  expect(rows[0].querySelectorAll('td')[1].textContent).to.equal('Original 1');

  // Replace all rows with new data (different IDs)
  const newRows: { id: number; label: string }[] = [];
  for (let i = 2001; i <= 3000; i++) {
    newRows.push({ id: i, label: `Replaced ${i}` });
  }
  dataState.set(newRows);
  flushScheduler();

  // Verify replacement
  tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found after replace');
  rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(1000);

  // Check new first row
  const firstCells = rows[0].querySelectorAll('td');
  expect(firstCells[0].textContent).to.equal('2001');
  expect(firstCells[1].textContent).to.equal('Replaced 2001');

  // Check new last row
  const lastCells = rows[999].querySelectorAll('td');
  expect(lastCells[0].textContent).to.equal('3000');
  expect(lastCells[1].textContent).to.equal('Replaced 3000');

  cleanup();
});
