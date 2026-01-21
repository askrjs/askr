import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland } from '../../src';
import { createTestContainer } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should render table rows (tr) elements correctly with For', () => {
  const { container, cleanup } = createTestContainer();

  const Component = () => {
    const rows = [
      { id: 1, label: 'Row 1' },
      { id: 2, label: 'Row 2' },
      { id: 3, label: 'Row 3' },
    ];

    return {
      type: 'table',
      props: {},
      children: [
        {
          type: 'tbody',
          props: {},
          children: [
            For(
              () => rows,
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

  // Check that rows were rendered
  const tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found');

  const rows = tbody.querySelectorAll('tr');
  expect(rows.length).to.equal(3);

  // Check first row content
  const firstRow = rows[0];
  const cells = firstRow.querySelectorAll('td');
  expect(cells.length).to.equal(2);
  expect(cells[0].textContent).to.equal('1');
  expect(cells[1].textContent).to.equal('Row 1');

  cleanup();
});
