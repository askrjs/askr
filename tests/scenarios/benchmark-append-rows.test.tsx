import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should append 1,000 rows to existing 1,000 rows', () => {
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
              }),
              { by: (row) => row.id }
            ),
          ],
        },
      ],
    };
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
  expect(rows[999].querySelectorAll('td')[1].textContent).to.equal('Item 1000');

  // Append 1000 more rows
  const additionalRows: { id: number; label: string }[] = [];
  for (let i = 1001; i <= 2000; i++) {
    additionalRows.push({ id: i, label: `Item ${i}` });
  }
  dataState.set((d) => d.concat(additionalRows));
  flushScheduler();

  // Verify we now have 2000 rows
  tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found after append');
  rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(2000);

  // Check that original rows are still there
  expect(rows[0].querySelectorAll('td')[1].textContent).to.equal('Item 1');
  expect(rows[999].querySelectorAll('td')[1].textContent).to.equal('Item 1000');

  // Check newly appended rows
  expect(rows[1000].querySelectorAll('td')[1].textContent).to.equal(
    'Item 1001'
  );
  expect(rows[1999].querySelectorAll('td')[1].textContent).to.equal(
    'Item 2000'
  );

  cleanup();
});
