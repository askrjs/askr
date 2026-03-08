import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should create 1,000 table rows from scratch', { timeout: 20000 }, () => {
  const { container, cleanup } = createTestContainer();

  let dataState: ReturnType<typeof state<{ id: number; label: string }[]>>;

  const Component = () => {
    dataState = state<{ id: number; label: string }[]>([]);
    dataState(); // Read state to establish tracking

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

  // Build 1000 rows after component is mounted
  const rows: { id: number; label: string }[] = [];
  for (let i = 1; i <= 1000; i++) {
    rows.push({ id: i, label: `Item ${i}` });
  }
  dataState.set(rows);
  flushScheduler();

  // Verify all 1000 rows were created
  const tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found');

  const domRows = tbody.querySelectorAll('tr');
  expect(domRows.length).to.equal(1000);

  // Check first row
  const firstRow = domRows[0];
  const firstCells = firstRow.querySelectorAll('td');
  expect(firstCells[0].textContent).to.equal('1');
  expect(firstCells[1].textContent).to.equal('Item 1');

  // Check last row
  const lastRow = domRows[999];
  const lastCells = lastRow.querySelectorAll('td');
  expect(lastCells[0].textContent).to.equal('1000');
  expect(lastCells[1].textContent).to.equal('Item 1000');

  // Check middle row
  const midRow = domRows[500];
  const midCells = midRow.querySelectorAll('td');
  expect(midCells[0].textContent).to.equal('501');
  expect(midCells[1].textContent).to.equal('Item 501');

  cleanup();
});
