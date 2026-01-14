import { bench, describe } from 'vitest';
import { state, type State } from '../../src';
import {
  createComponentInstance,
  setCurrentComponentInstance,
} from '../../src/runtime/component';

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

describe('for reactivity', () => {
  bench('1000 rows', () => {
    const rowCount = 1000;
    const inst = createComponentInstance(
      'bench-reactivity',
      () => null,
      {},
      null
    );
    setCurrentComponentInstance(inst);

    const rows: State<Row[]> = state(createRows(rowCount));
    const _initialRows = rows();

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

    for (const sub of subscriptions) {
      sub();
    }

    for (let i = 0; i < 10; i++) {
      const current = rows();
      rows.set(updateEveryTenth(current));

      for (const sub of subscriptions) {
        sub();
      }
    }

    setCurrentComponentInstance(null);
  });
});
