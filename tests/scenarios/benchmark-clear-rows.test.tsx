import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should clear all rows', () => {
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
