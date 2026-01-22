import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should toggle selected row class', () => {
  const { container, cleanup } = createTestContainer();

  let dataState: ReturnType<typeof state<{ id: number; label: string }[]>>;
  let selectedState: ReturnType<typeof state<number | null>>;

  const Component = () => {
    dataState = state<{ id: number; label: string }[]>([]);
    selectedState = state<number | null>(null);

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
                props: {
                  key: row.id,
                  class: () => (selectedState() === row.id ? 'selected' : ''),
                },
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
