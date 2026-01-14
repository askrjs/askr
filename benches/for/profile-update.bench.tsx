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

// Global timing object to collect metrics
const timings: Record<string, number[]> = {};

function mark(label: string) {
  performance.mark(label);
}

function measure(label: string, start: string, end: string) {
  try {
    performance.measure(label, start, end);
    const entries = performance.getEntriesByName(label);
    if (entries.length > 0) {
      const duration = entries[entries.length - 1].duration;
      if (!timings[label]) timings[label] = [];
      timings[label].push(duration);
    }
  } catch {
    // Ignore
  }
}

describe('profile_list_update_dom', () => {
  bench('PROFILING::update-every-10th::10000', () => {
    timings.clear = () => {
      Object.keys(timings).forEach((k) => delete timings[k]);
    };
    timings.clear();

    const { container, cleanup } = createTestContainer();
    const rowCount = 10000;
    let rows!: State<Row[]>;

    const Component = () => {
      rows = state(createRows(rowCount));
      return (
        <div>
          {For(
            () => rows(),
            (row) => (<div key={row.id}>{row.label}</div>) as unknown as JSX.Element
          )}
        </div>
      );
    };

    mark('init-start');
    createIsland({ root: container, component: Component });
    mark('init-end');
    measure('initial-mount', 'init-start', 'init-end');

    const iterations = 5;

    for (let i = 0; i < iterations; i++) {
      mark(`iter-${i}-state-start`);
      rows.set(updateEveryTenth(rows()));
      mark(`iter-${i}-state-end`);
      measure(
        `iteration-${i}-state-set`,
        `iter-${i}-state-start`,
        `iter-${i}-state-end`
      );

      mark(`iter-${i}-flush-start`);
      flushScheduler();
      mark(`iter-${i}-flush-end`);
      measure(
        `iteration-${i}-flush`,
        `iter-${i}-flush-start`,
        `iter-${i}-flush-end`
      );
    }

    cleanup();

    // Log results
    if (process.env.NODE_ENV !== 'production') {
      console.error('\n=== PROFILING RESULTS ===');
      console.error(
        'initial-mount:',
        timings['initial-mount']
          ? timings['initial-mount'][0].toFixed(2) + 'ms'
          : 'N/A'
      );
      for (let i = 0; i < iterations; i++) {
        const stateTime = timings[`iteration-${i}-state-set`]?.[0];
        const flushTime = timings[`iteration-${i}-flush`]?.[0];
        console.error(
          `iteration-${i}: state=${stateTime?.toFixed(2) || 'N/A'}ms, flush=${flushTime?.toFixed(2) || 'N/A'}ms`
        );
      }
      console.error('========================\n');
    }
  });
});
