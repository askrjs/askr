import { expect } from 'chai';
import { test } from 'vite-plus/test';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should clear all rows', { timeout: 20000 }, () => {
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

  // Initial 1000 rows
  const initialRows: { id: number; label: string }[] = [];
  for (let i = 1; i <= 1000; i++) {
    initialRows.push({ id: i, label: `Item ${i}` });
  }
  dataState.set(initialRows);
  flushScheduler();

  let tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found');

  // Verify initial 1000 rows
  let rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(1000);

  // Clear all rows
  dataState.set([]);
  flushScheduler();

  // Verify all rows are gone
  tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found after clear');
  rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(0);

  cleanup();
});
