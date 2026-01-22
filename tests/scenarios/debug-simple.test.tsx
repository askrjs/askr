import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should update state with For (debug)', () => {
  const { container, cleanup } = createTestContainer();

  let dataState: ReturnType<typeof state<{ id: number; label: string }[]>>;

  const Component = () => {
    dataState = state<{ id: number; label: string }[]>([]);

    // Read the state to establish reactive tracking
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

  // Add 3 rows
  dataState.set([
    { id: 1, label: 'Item 1' },
    { id: 2, label: 'Item 2' },
    { id: 3, label: 'Item 3' },
  ]);
  flushScheduler();

  const tbody = container.querySelector('tbody');
  if (!tbody) throw new Error('tbody not found');

  const domRows = tbody.querySelectorAll('tr');
  expect(domRows.length).to.equal(3);

  cleanup();
});
