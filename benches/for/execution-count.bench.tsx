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

describe('for execution count', () => {
  bench('update every 10th (1000 rows)', () => {
    const rowCount = 1000;
    let _rowExecutionCount = 0;

    const RowRenderer = (_row: Row): null => {
      _rowExecutionCount++;
      return null;
    };

    let rows = createRows(rowCount);
    const forState = createForState(() => rows, RowRenderer);
    evaluateForState(forState, () => rows);

    _rowExecutionCount = 0;
    rows = updateEveryTenth(rows);
    evaluateForState(forState, () => rows);
  });
});
