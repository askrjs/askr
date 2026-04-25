import { expect } from 'chai';
import { test } from 'vite-plus/test';
import { createIsland, state } from '../../../src';
import { createTestContainer, flushScheduler } from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';

test('should toggle selected row class', { timeout: 20000 }, () => {
  const { container, cleanup } = createTestContainer();

  let dataState: ReturnType<typeof state<{ id: number; label: string }[]>>;
  let selectedState: ReturnType<typeof state<number | null>>;

  const Component = () => {
    dataState = state<{ id: number; label: string }[]>([]);
    selectedState = state<number | null>(null);
    const selectedId = selectedState();

    return (
      <table>
        <tbody data-selected={selectedId == null ? '' : String(selectedId)}>
          {
            <For each={() => dataState()} by={(row) => row.id}>
              {(row) => (
                <tr
                  key={row.id}
                  class={() => (selectedState() === row.id ? 'selected' : '')}
                >
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

  // Create 100 rows for faster test
  const rows: { id: number; label: string }[] = [];
  for (let i = 1; i <= 100; i++) {
    rows.push({ id: i, label: `Item ${i}` });
  }
  dataState.set(rows);
  flushScheduler();

  // Select row 50
  selectedState.set(50);
  flushScheduler();

  const tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found');

  let domRows = tbody.querySelectorAll('tr');
  expect(domRows[49].className).to.equal('selected');
  expect(domRows[0].className).to.equal('');
  expect(domRows[50].className).to.equal('');

  // Change selection to row 1
  selectedState.set(1);
  flushScheduler();
  domRows = tbody.querySelectorAll('tr');
  expect(domRows[0].className).to.equal('selected');
  expect(domRows[49].className).to.equal('');

  // Deselect
  selectedState.set(null);
  flushScheduler();
  domRows = tbody.querySelectorAll('tr');
  expect(domRows[0].className).to.equal('');
  expect(domRows[49].className).to.equal('');

  cleanup();
});
