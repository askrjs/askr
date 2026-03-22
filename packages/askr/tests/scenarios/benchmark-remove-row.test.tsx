import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should remove a single row from the middle', { timeout: 20000 }, () => {
  const { container, cleanup } = createTestContainer();

  let dataState: ReturnType<typeof state<{ id: number; label: string }[]>>;

  const Component = () => {
    dataState = state<{ id: number; label: string }[]>([]);
    dataState();

    return (
      <table>
        <tbody>
          {For(
            () => dataState(),
            (row) => row.id,
            (row) => (
              <tr key={row.id}>
                <td>{String(row.id)}</td>
                <td>{row.label}</td>
              </tr>
            )
          )}
        </tbody>
      </table>
    );
  };

  createIsland({ root: container, component: Component });
  flushScheduler();

  // Create 100 rows for faster test
  const initialRows: { id: number; label: string }[] = [];
  for (let i = 1; i <= 100; i++) {
    initialRows.push({ id: i, label: `Item ${i}` });
  }
  dataState.set(initialRows);
  flushScheduler();

  let tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found');

  // Verify initial state
  let rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(100);
  expect(rows[49].querySelectorAll('td')[1].textContent).to.equal('Item 50');
  expect(rows[50].querySelectorAll('td')[1].textContent).to.equal('Item 51');

  // Remove row with id 50
  dataState.set((d) => d.filter((item) => item.id !== 50));
  flushScheduler();

  // Verify removal
  tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found after removal');
  rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(99);

  // Position 49 should now have Item 51 (since Item 50 was removed)
  expect(rows[49].querySelectorAll('td')[1].textContent).to.equal('Item 51');

  // Verify Item 50 is gone
  const labels = Array.from(rows).map(
    (row) => row.querySelectorAll('td')[1].textContent
  );
  expect(labels).to.not.include('Item 50');

  cleanup();
});
