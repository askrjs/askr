import { bench, describe } from 'vitest';
import { createIsland, state, type State } from '../../src';
import { For } from '../../src/for';
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

describe('for create', () => {
  bench('1000 rows', () => {
    const { container, cleanup } = createTestContainer();
    let rows!: State<Row[]>;

    const Component = () => {
      rows = state(createRows(1000));
      return (
        <div>
          {For(
            () => rows(),
            (row) => (
              <div key={row.id}>{row.label}</div>
            )
          )}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    cleanup();
  });

  bench('10000 rows', () => {
    const { container, cleanup } = createTestContainer();
    let rows!: State<Row[]>;

    const Component = () => {
      rows = state(createRows(10000));
      return (
        <div>
          {For(
            () => rows(),
            (row) => (
              <div key={row.id}>{row.label}</div>
            )
          )}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    cleanup();
  });
});
