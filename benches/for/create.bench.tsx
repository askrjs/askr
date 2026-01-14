/**
 * bench_list_create.ts
 *
 * PURPOSE: Measure render cost only
 * - state<Row[]>
 * - Render 1,000 and 10,000 rows
 * - No updates after render
 */

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

describe('bench_list_create', () => {
  bench('framework::for::create::1000', () => {
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

  bench('framework::for::create::10000', () => {
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
