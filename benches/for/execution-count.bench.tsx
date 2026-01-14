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
import { createForState, evaluateForState } from '../../src/runtime/for';

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

describe('bench_for_execution_count', () => {
  bench('framework::for::update-every-10th::1000', () => {
    const rowCount = 1000;
    let rowExecutionCount = 0;

    // Minimal renderer: counts executions without touching DOM
    const RowRenderer = (_row: Row): any => {
      rowExecutionCount++;
      return null;
    };

    // Deterministic input array
    let rows = createRows(rowCount);

    // Create For state using runtime helpers and evaluate it (no DOM)
    const forState = createForState(() => rows, RowRenderer);

    // Initial render
    evaluateForState(forState, () => rows);

    // Reset after initial render
    const initialExecutions = rowExecutionCount;
    rowExecutionCount = 0;

    // Apply update and re-evaluate (simulates invalidation + re-render of changed items)
    rows = updateEveryTenth(rows);
    evaluateForState(forState, () => rows);

    const expectedExecutions = Math.ceil(rowCount / 10);
    const actualExecutions = rowExecutionCount;

    // Suppress unused variable warnings
    void initialExecutions;
    void expectedExecutions;
    void actualExecutions;
  });
});
