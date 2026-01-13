/**
 * bench_list_update_no_dom.ts
 *
 * PURPOSE: Measure reactivity graph + invalidation
 * - state<Row[]>
 * - Update every 10th row
 * - NO JSX rendering
 * - Only reactive subscriptions
 */

import { bench, describe } from 'vitest';
import { state, type State } from '../../src';

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

describe('bench_list_update_no_dom', () => {
  bench('1000 rows update every 10th (reactivity + invalidation)', () => {
    const rowCount = 1000;
    let rows!: State<Row[]>;

    // Simulate component context for state creation
    const fakeInstance = {
      stateValues: [],
      nextStateIndex: 0,
    };
    (globalThis as any).__ASKR_CURRENT_INSTANCE__ = fakeInstance;

    rows = state(createRows(rowCount));

    // Read the state to establish subscription
    const initialRows = rows();

    // Create derived computations that subscribe to rows
    const subscriptions: Array<() => void> = [];
    for (let i = 0; i < rowCount; i++) {
      subscriptions.push(() => {
        const current = rows();
        const row = current[i];
        if (row) {
          void row.label;
        }
      });
    }

    // Execute all subscriptions to establish reactivity graph
    for (const sub of subscriptions) {
      sub();
    }

    const iterations = 10;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const current = rows();
      rows.set(updateEveryTenth(current));

      // Simulate invalidation by re-executing subscriptions
      for (const sub of subscriptions) {
        sub();
      }
    }

    const end = performance.now();
    const total = end - start;
    const avg = total / iterations;

    console.log('\nbench_list_update_no_dom');
    console.log(`Rows: ${rowCount}`);
    console.log(`Iterations: ${iterations}`);
    console.log(`Total: ${total.toFixed(2)}ms`);
    console.log(`Avg per iteration: ${avg.toFixed(4)}ms`);

    (globalThis as any).__ASKR_CURRENT_INSTANCE__ = null;
  });
});
