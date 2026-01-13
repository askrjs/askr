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
import { createComponentInstance, setCurrentComponentInstance } from '../../src/runtime/component';

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
  bench('framework::for::reactivity::1000', () => {
    const rowCount = 1000;
    // Create a real component instance to establish a reactive context
    const inst = createComponentInstance('bench-reactivity', () => null, {}, null);
    setCurrentComponentInstance(inst);

    const rows: State<Row[]> = state(createRows(rowCount));

    // Read the state to establish subscription
    const _initialRows = rows();

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

    for (let i = 0; i < iterations; i++) {
      const current = rows();
      rows.set(updateEveryTenth(current));

      // Simulate invalidation by re-executing subscriptions
      for (const sub of subscriptions) {
        sub();
      }
    }

    setCurrentComponentInstance(null);
  });
});
