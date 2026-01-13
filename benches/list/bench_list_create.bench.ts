/**
 * bench_list_create.ts
 *
 * PURPOSE: Measure render cost only
 * - state<Row[]>
 * - Render 1,000 and 10,000 rows
 * - No updates after render
 */

import { bench, describe } from 'vitest';
import { createIsland, state, type State } from '../../src';
import { createTestContainer } from '../../tests/helpers/test-renderer';

interface Row {
  id: number;
  label: string;
}

function createRows(count: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({ id: i, label: `Row ${i}` });
  }
  return rows;
}

describe('bench_list_create', () => {
  bench('1000 rows initial render (render cost only)', () => {
    const { container, cleanup } = createTestContainer();
    let rows!: State<Row[]>;

    const Component = () => {
      rows = state(createRows(1000));
      const currentRows = rows();
      const children = [];
      for (let i = 0; i < currentRows.length; i++) {
        const row = currentRows[i];
        children.push({
          type: 'div',
          props: { key: row.id },
          children: [String(row.label)],
        });
      }
      return { type: 'div', children };
    };

    const start = performance.now();
    createIsland({ root: container, component: Component });
    const end = performance.now();
    const total = end - start;

    console.log(`\nbench_list_create (1000 rows)`);
    console.log(`Total: ${total.toFixed(2)}ms`);

    cleanup();
  });

  bench('10000 rows initial render (render cost only)', () => {
    const { container, cleanup } = createTestContainer();
    let rows!: State<Row[]>;

    const Component = () => {
      rows = state(createRows(10000));
      const currentRows = rows();
      const children = [];
      for (let i = 0; i < currentRows.length; i++) {
        const row = currentRows[i];
        children.push({
          type: 'div',
          props: { key: row.id },
          children: [String(row.label)],
        });
      }
      return { type: 'div', children };
    };

    const start = performance.now();
    createIsland({ root: container, component: Component });
    const end = performance.now();
    const total = end - start;

    console.log(`\nbench_list_create (10000 rows)`);
    console.log(`Total: ${total.toFixed(2)}ms`);

    cleanup();
  });
});
