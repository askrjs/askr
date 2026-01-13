/**
 * bench_list_create.ts
 *
 * PURPOSE: Measure render cost only
 * - state<Row[]>
 * - Render 1,000 and 10,000 rows
 * - No updates after render
 *
 * RUN: npx tsx perf/bench_list_create.ts
 */

import { createIsland, state, type State } from '../../src';
import { createTestContainer } from '../helpers/test-renderer';

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

function runBenchmark(rowCount: number) {
  const { container, cleanup } = createTestContainer();
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

  const start = performance.now();
  createIsland({ root: container, component: Component });
  const end = performance.now();
  const total = end - start;

  console.warn(`bench_list_create (${rowCount} rows)`);
  console.warn(`Total: ${total.toFixed(2)}ms`);
  console.warn('');

  cleanup();
}

runBenchmark(1000);
runBenchmark(10000);
