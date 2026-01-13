/**
 * bench_list_update_dom.ts
 *
 * PURPOSE: Measure diff + commit cost
 * - Full render + update-every-10th
 * - Measure scheduler + commit
 */

import { bench, describe } from 'vitest';
import { createIsland, state, type State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

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

function updateEveryTenth(rows: Row[]): Row[] {
  return rows.map((row, idx) => {
    if (idx % 10 === 0) {
      return { ...row, label: `${row.label}!` };
    }
    return row;
  });
}

describe('bench_list_update_dom', () => {
  bench('1000 rows update every 10th (diff + commit)', () => {
    const { container, cleanup } = createTestContainer();
    const rowCount = 1000;
    let rows!: State<Row[]>;

    const Component = () => {
      rows = state(createRows(rowCount));
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

    createIsland({ root: container, component: Component });

    const iterations = 10;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      rows.set(updateEveryTenth(rows()));
      flushScheduler();
    }

    const end = performance.now();
    const total = end - start;
    const avg = total / iterations;

    console.log(`\nbench_list_update_dom (${rowCount} rows)`);
    console.log(`Iterations: ${iterations}`);
    console.log(`Total: ${total.toFixed(2)}ms`);
    console.log(`Avg per iteration: ${avg.toFixed(4)}ms`);
    console.log(`Updates per iteration: ${Math.ceil(rowCount / 10)} rows`);

    cleanup();
  });

  bench('10000 rows update every 10th (diff + commit)', () => {
    const { container, cleanup } = createTestContainer();
    const rowCount = 10000;
    let rows!: State<Row[]>;

    const Component = () => {
      rows = state(createRows(rowCount));
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

    createIsland({ root: container, component: Component });

    const iterations = 5;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      rows.set(updateEveryTenth(rows()));
      flushScheduler();
    }

    const end = performance.now();
    const total = end - start;
    const avg = total / iterations;

    console.log(`\nbench_list_update_dom (${rowCount} rows)`);
    console.log(`Iterations: ${iterations}`);
    console.log(`Total: ${total.toFixed(2)}ms`);
    console.log(`Avg per iteration: ${avg.toFixed(4)}ms`);
    console.log(`Updates per iteration: ${Math.ceil(rowCount / 10)} rows`);

    cleanup();
  });
});
