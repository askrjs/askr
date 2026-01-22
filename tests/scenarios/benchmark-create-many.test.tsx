import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should create 5,000 table rows', () => {
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

  // Build 5,000 rows
  const rows: { id: number; label: string }[] = [];
  for (let i = 1; i <= 5000; i++) {
    rows.push({ id: i, label: `Item ${i}` });
  }
  dataState.set(rows);
  flushScheduler();

  // Verify all 5,000 rows were created
  const tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found');

  const domRows = tbody.querySelectorAll('tr');
  expect(domRows.length).to.equal(5000);

  // Spot check a few rows
  expect(domRows[0].querySelectorAll('td')[1].textContent).to.equal('Item 1');
  expect(domRows[2500].querySelectorAll('td')[1].textContent).to.equal(
    'Item 2501'
  );
  expect(domRows[4999].querySelectorAll('td')[1].textContent).to.equal(
    'Item 5000'
  );

  cleanup();
});
