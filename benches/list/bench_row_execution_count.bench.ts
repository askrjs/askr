/**
 * bench_row_execution_count.ts
 * 
 * PURPOSE: Detect over-invalidation
 * - Render 1,000 rows
 * - Instrument Row function with a counter
 * - Run update-every-10th once
 * - Print expected vs actual executions
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

describe('bench_row_execution_count', () => {
  bench('1000 rows detect over-invalidation', () => {
    const { container, cleanup } = createTestContainer();
    const rowCount = 1000;
    let rows!: State<Row[]>;
    let rowExecutionCount = 0;

    const RowComponent = (row: Row) => {
      rowExecutionCount++;
      return {
        type: 'div',
        props: { key: row.id },
        children: [String(row.label)],
      };
    };

    const Component = () => {
      rows = state(createRows(rowCount));
      const currentRows = rows();
      const children = [];
      for (let i = 0; i < currentRows.length; i++) {
        children.push(RowComponent(currentRows[i]));
      }
      return { type: 'div', children };
    };

    createIsland({ root: container, component: Component });
    
    // Reset counter after initial render
    const initialExecutions = rowExecutionCount;
    rowExecutionCount = 0;

    // Update every 10th row
    rows.set(updateEveryTenth(rows()));
    flushScheduler();

    const expectedExecutions = Math.ceil(rowCount / 10);
    const actualExecutions = rowExecutionCount;
    const overInvalidation = actualExecutions > expectedExecutions;

    console.log('\nbench_row_execution_count');
    console.log(`Total rows: ${rowCount}`);
    console.log(`Initial render executions: ${initialExecutions}`);
    console.log(`Expected executions (update every 10th): ~${expectedExecutions}`);
    console.log(`Actual executions: ${actualExecutions}`);
    console.log(`Over-invalidation detected: ${overInvalidation ? 'YES' : 'NO'}`);
    if (overInvalidation) {
      console.log(`Over-invalidation ratio: ${(actualExecutions / expectedExecutions).toFixed(2)}x`);
    }

    cleanup();
  });
});
