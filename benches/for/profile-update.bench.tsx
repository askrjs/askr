/**
 * profile-update.bench.tsx
 *
 * PURPOSE: Profile the update-every-10th::10000 to find bottlenecks
 * - Adds timing instrumentation at key points
 * - Measures: state update, reconciliation, DOM creation, appendChild
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

function updateEveryTenth(rows: Row[]): Row[] {
  return rows.map((row, idx) => {
    if (idx % 10 === 0) {
      return { ...row, label: `${row.label}!` };
    }
    return row;
  });
}

describe('profile_list_update_dom', () => {
  bench('PROFILING::update-every-10th::10000', () => {
    const { container, cleanup } = createTestContainer();
    const rowCount = 10000;
    let rows!: State<Row[]>;

    const Component = () => {
      rows = state(createRows(rowCount));
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

    const iterations = 5;

    for (let i = 0; i < iterations; i++) {
      rows.set(updateEveryTenth(rows()));
      flushScheduler();
    }

    cleanup();

    // Suppress unused variable warnings
    void timings;
  });
});
