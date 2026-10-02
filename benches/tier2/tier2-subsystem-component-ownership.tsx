import { describe, expect, test } from 'vite-plus/test';
import { state, type State } from '../../src';
import { createIsland } from '../../src/boot';
import { defineSetupComponent } from '../../src/core/component/setup';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import { tier2BenchOptions, runBench } from '../shared/_shared';

const ownershipBenchOptions = {
  ...tier2BenchOptions,
  time: 3_000,
  warmupTime: 1_000,
  warmupIterations: 3,
};

type Row = { id: number; label: string };

const firstRows: Row[] = Array.from({ length: 100 }, (_, index) => ({
  id: index,
  label: `row-${index}`,
}));
const nextRows = firstRows
  .map((row) => ({ ...row, label: `${row.label}-updated` }))
  .reverse();

function PositionalRow(props: { row: Row }) {
  const value = state(0);
  return (
    <li data-row={props.row.id}>
      {props.row.label}:{value()}
    </li>
  );
}

const SetupRow = defineSetupComponent<{ row: Row }>(() => {
  const value = state(0);
  return (props) => (
    <li data-row={props.row.id}>
      {props.row.label}:{value()}
    </li>
  );
});

function mountRows(mode: 'positional' | 'setup') {
  const fixture = createTestContainer();
  let rows!: State<readonly Row[]>;
  const RowComponent = mode === 'setup' ? SetupRow : PositionalRow;
  createIsland({
    root: fixture.container,
    component: () => {
      rows = state<readonly Row[]>(firstRows);
      return (
        <ul>
          {rows().map((row) => (
            <RowComponent key={row.id} row={row} />
          ))}
        </ul>
      );
    },
  });
  flushScheduler();
  expect(fixture.container.querySelectorAll('li')).toHaveLength(100);
  return {
    container: fixture.container,
    update(next: readonly Row[]) {
      rows.set(next);
      flushScheduler();
    },
    cleanup: fixture.cleanup,
  };
}

for (const mode of ['positional', 'setup'] as const) {
  describe(`tier2 component ownership: ${mode}`, () => {
    test('mount and dispose 100 stateful keyed rows', async ({ bench }) => {
      await runBench(
        bench,
        'mount and dispose 100 stateful keyed rows',
        () => {
          const mounted = mountRows(mode);
          mounted.cleanup();
        },
        ownershipBenchOptions
      );
    });

    let mounted: ReturnType<typeof mountRows> | null = null;
    let next = false;
    test('update props and reverse 100 stateful keyed rows', async ({
      bench,
    }) => {
      await runBench(
        bench,
        'update props and reverse 100 stateful keyed rows',
        () => {
          mounted!.update(next ? firstRows : nextRows);
          next = !next;
        },
        {
          ...ownershipBenchOptions,
          setup() {
            mounted = mountRows(mode);
            next = false;
          },
          teardown() {
            mounted?.cleanup();
            mounted = null;
          },
        }
      );
    });
  });
}

{
  const positional = mountRows('positional');
  const setup = mountRows('setup');
  try {
    positional.update(nextRows);
    setup.update(nextRows);
    for (const container of [positional.container, setup.container]) {
      expect(
        [...container.querySelectorAll('li')].map((row) =>
          row.getAttribute('data-row')
        )
      ).toEqual([...firstRows].reverse().map((row) => String(row.id)));
      expect(container.textContent).toContain('row-99-updated:0');
    }
  } finally {
    positional.cleanup();
    setup.cleanup();
  }
}
