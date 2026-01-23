import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should update every 10th row', () => {
  const { container, cleanup } = createTestContainer();

  let dataState: ReturnType<typeof state<{ id: number; label: string }[]>>;

  const Component = () => {
    dataState = state<{ id: number; label: string }[]>([]);
    dataState();

    return {
      type: 'table',
      props: {},
      children: [
        {
          type: 'tbody',
          props: {},
          children: [
            For(
              () => dataState(),
              (row) => row.id,
              (row) => ({
                type: 'tr',
                props: { key: row.id },
                children: [
                  {
                    type: 'td',
                    props: {},
                    children: [String(row.id)],
                  },
                  {
                    type: 'td',
                    props: {},
                    children: [row.label],
                  },
                ],
              })
            ),
          ],
        },
      ],
    };
  };

  createIsland({ root: container, component: Component });
  flushScheduler();

  // Initial data
  const initialRows: { id: number; label: string }[] = [];
  for (let i = 1; i <= 1000; i++) {
    initialRows.push({ id: i, label: `Item ${i}` });
  }
  dataState.set(initialRows);
  flushScheduler();

  // Verify initial state
  let tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found');
  let rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(1000);
  expect(rows[0].querySelectorAll('td')[1].textContent).to.equal('Item 1');
  expect(rows[9].querySelectorAll('td')[1].textContent).to.equal('Item 10');

  // Update every 10th row (indices 0, 10, 20, 30, ...)
  dataState.set((d) =>
    d.map((item, index) =>
      index % 10 === 0 ? { ...item, label: item.label + ' !!!' } : item
    )
  );
  flushScheduler();

  // Verify updates
  tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found after update');
  rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(1000);

  // Row 1 (index 0) should be updated
  expect(rows[0].querySelectorAll('td')[1].textContent).to.equal('Item 1 !!!');

  // Row 2 (index 1) should NOT be updated
  expect(rows[1].querySelectorAll('td')[1].textContent).to.equal('Item 2');

  // Row 11 (index 10) should be updated
  expect(rows[10].querySelectorAll('td')[1].textContent).to.equal(
    'Item 11 !!!'
  );

  // Row 12 (index 11) should NOT be updated
  expect(rows[11].querySelectorAll('td')[1].textContent).to.equal('Item 12');

  // Row 101 (index 100) should be updated
  expect(rows[100].querySelectorAll('td')[1].textContent).to.equal(
    'Item 101 !!!'
  );

  cleanup();
});
