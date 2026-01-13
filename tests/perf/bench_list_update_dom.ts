/**
 * bench_list_update_dom.ts
 *
 * PURPOSE: Measure diff + commit cost
 * - Full render + update-every-10th
 * - Measure scheduler + commit
 *
 * RUN: npx tsx perf/bench_list_update_dom.ts
 */

import { createIsland, state, type State } from '../src';
import {
  createTestContainer,
  flushScheduler,
} from '../tests/helpers/test-renderer';

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

function runBenchmark(rowCount: number, iterations: number) {
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

  createIsland({ root: container, component: Component });

  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    rows.set(updateEveryTenth(rows()));
    flushScheduler();
  }

  const end = performance.now();
  const total = end - start;
  const avg = total / iterations;

  console.log(`bench_list_update_dom (${rowCount} rows)`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Total: ${total.toFixed(2)}ms`);
  console.log(`Avg per iteration: ${avg.toFixed(4)}ms`);
  console.log(`Updates per iteration: ${Math.ceil(rowCount / 10)} rows`);
  console.log('');

  cleanup();
}

const FAST_BENCH =
  process.env.ASKR_BENCH_FAST === '1' ||
  process.env.CI === 'true' ||
  process.env.CI === '1';

if (FAST_BENCH) {
  runBenchmark(1000, 20);
  runBenchmark(10000, 1);
} else {
  runBenchmark(1000, 100);
  runBenchmark(10000, 10);
}
