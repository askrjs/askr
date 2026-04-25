import { bench, describe } from 'vite-plus/test';
import { createIsland, selector, state, type State } from '../../../src';
import { BenchmarkTable } from '../../../src/bench/components/benchmark-table';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import type { BenchToggle, RowData } from '../../shared/_shared';
import {
  assertOrderTransition,
  assertRowCountTransition,
  assertSelectionTransition,
  assertTextTransition,
  assertToggleMutationGuard,
  buildRows,
  createCachedElementQuery,
  createRowToggle,
  createSelectionToggle,
  removeRowById,
  swapRows,
  noisyTier4BenchOptions,
  tier4BenchOptions,
  updateEveryNthRow,
} from '../../shared/_shared';

function mountJsxBenchmarkApp(initialRows: RowData[]) {
  const { container, cleanup } = createTestContainer();
  let dataState!: State<RowData[]>;
  let selectedState!: State<number | null>;
  const primaryLinks = createCachedElementQuery<HTMLElement>(
    container,
    'tbody tr td:nth-child(2) a'
  );

  const App = () => {
    dataState = state(initialRows);
    selectedState = state<number | null>(null);
    const isSelected = selector(selectedState);

    const remove = (id: number) =>
      dataState.set((rows) => rows.filter((row) => row.id !== id));
    const select = (id: number) => selectedState.set(id);

    return (
      <div class="container">
        <BenchmarkTable
          rows={dataState}
          isSelected={isSelected}
          onSelect={select}
          onRemove={remove}
        />
      </div>
    );
  };

  createIsland({ root: container, component: App });
  flushScheduler();

  return {
    container,
    cleanup,
    setRows(rows: RowData[]) {
      dataState.set(rows);
      flushScheduler();
      primaryLinks.invalidate();
    },
    clickRow(index: number) {
      primaryLinks
        .getAt(index)
        .dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true })
        );
      flushScheduler();
    },
  };
}

const emptyRows: RowData[] = [];
const rows1000 = buildRows(1000);
const rows2000 = buildRows(2000);
const updatedRows = updateEveryNthRow(rows1000);
const swappedRows = swapRows(rows1000, 1, 998);
const removedRows = removeRowById(rows1000, 500);

{
  const app = mountJsxBenchmarkApp(emptyRows);
  try {
    const createToggle = createRowToggle(emptyRows, rows1000, 'initial');
    assertToggleMutationGuard(
      app.container,
      () => {
        app.setRows(createToggle.next() as RowData[]);
      },
      () => {
        app.setRows(createToggle.next() as RowData[]);
      },
      {
        label: 'tier4 jsx create rows',
        afterForward: () => assertRowCountTransition(app.container, 1000),
        afterBackward: () => assertRowCountTransition(app.container, 0),
      }
    );
  } finally {
    app.cleanup();
  }
}

{
  const app = mountJsxBenchmarkApp(rows1000);
  try {
    const selectToggle = createSelectionToggle(498, 499, 'first');
    app.clickRow(selectToggle.current());
    assertSelectionTransition(app.container, 498);

    assertToggleMutationGuard(
      app.container,
      () => {
        app.clickRow(selectToggle.next());
      },
      () => {
        app.clickRow(selectToggle.next());
      },
      {
        label: 'tier4 jsx selection',
        afterForward: () => assertSelectionTransition(app.container, 499),
        afterBackward: () => assertSelectionTransition(app.container, 498),
      }
    );

    const updateToggle = createRowToggle(rows1000, updatedRows, 'initial');
    assertToggleMutationGuard(
      app.container,
      () => {
        app.setRows(updateToggle.next() as RowData[]);
      },
      () => {
        app.setRows(updateToggle.next() as RowData[]);
      },
      {
        label: 'tier4 jsx update',
        afterForward: () => {
          assertTextTransition(
            app.container,
            'tbody tr:first-child td:nth-child(2) a',
            'Item 1 !!!'
          );
        },
        afterBackward: () => {
          assertTextTransition(
            app.container,
            'tbody tr:first-child td:nth-child(2) a',
            'Item 1'
          );
        },
      }
    );

    const swapToggle = createRowToggle(rows1000, swappedRows, 'initial');
    assertToggleMutationGuard(
      app.container,
      () => {
        app.setRows(swapToggle.next() as RowData[]);
      },
      () => {
        app.setRows(swapToggle.next() as RowData[]);
      },
      {
        label: 'tier4 jsx swap',
        afterForward: () =>
          assertOrderTransition(
            app.container,
            swappedRows.map((row) => row.id)
          ),
        afterBackward: () =>
          assertOrderTransition(
            app.container,
            rows1000.map((row) => row.id)
          ),
      }
    );

    const removeToggle = createRowToggle(rows1000, removedRows, 'initial');
    assertToggleMutationGuard(
      app.container,
      () => {
        app.setRows(removeToggle.next() as RowData[]);
      },
      () => {
        app.setRows(removeToggle.next() as RowData[]);
      },
      {
        label: 'tier4 jsx remove',
        afterForward: () => assertRowCountTransition(app.container, 999),
        afterBackward: () => assertRowCountTransition(app.container, 1000),
      }
    );

    const appendToggle = createRowToggle(rows1000, rows2000, 'initial');
    assertToggleMutationGuard(
      app.container,
      () => {
        app.setRows(appendToggle.next() as RowData[]);
      },
      () => {
        app.setRows(appendToggle.next() as RowData[]);
      },
      {
        label: 'tier4 jsx append',
        afterForward: () => assertRowCountTransition(app.container, 2000),
        afterBackward: () => assertRowCountTransition(app.container, 1000),
      }
    );

    const clearToggle = createRowToggle(rows1000, emptyRows, 'initial');
    assertToggleMutationGuard(
      app.container,
      () => {
        app.setRows(clearToggle.next() as RowData[]);
      },
      () => {
        app.setRows(clearToggle.next() as RowData[]);
      },
      {
        label: 'tier4 jsx clear',
        afterForward: () => assertRowCountTransition(app.container, 0),
        afterBackward: () => assertRowCountTransition(app.container, 1000),
      }
    );
  } finally {
    app.cleanup();
  }
}

describe('tier4 integration jsx benchmark app', () => {
  let app: ReturnType<typeof mountJsxBenchmarkApp> | null = null;
  let createToggle: BenchToggle<readonly RowData[]> | null = null;
  let selectToggle: BenchToggle<number> | null = null;
  let updateToggle: BenchToggle<readonly RowData[]> | null = null;
  let swapToggle: BenchToggle<readonly RowData[]> | null = null;
  let removeToggle: BenchToggle<readonly RowData[]> | null = null;
  let appendToggle: BenchToggle<readonly RowData[]> | null = null;
  let clearToggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'create 1,000 rows in the JSX app',
    () => {
      app!.setRows(createToggle!.next() as RowData[]);
    },
    {
      ...noisyTier4BenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(emptyRows);
        createToggle = createRowToggle(emptyRows, rows1000, 'initial');
      },
      teardown() {
        app?.cleanup();
        app = null;
        createToggle = null;
      },
    }
  );

  bench(
    'select one row through the JSX app click path',
    () => {
      app!.clickRow(selectToggle!.next());
    },
    {
      ...noisyTier4BenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(rows1000);
        selectToggle = createSelectionToggle(498, 499, 'first');
        app.clickRow(selectToggle.current());
      },
      teardown() {
        app?.cleanup();
        app = null;
        selectToggle = null;
      },
    }
  );

  bench(
    'update every 10th row in the JSX app',
    () => {
      app!.setRows(updateToggle!.next() as RowData[]);
    },
    {
      ...noisyTier4BenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(rows1000);
        updateToggle = createRowToggle(rows1000, updatedRows, 'initial');
      },
      teardown() {
        app?.cleanup();
        app = null;
        updateToggle = null;
      },
    }
  );

  bench(
    'swap distant rows in the JSX app',
    () => {
      app!.setRows(swapToggle!.next() as RowData[]);
    },
    {
      ...tier4BenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(rows1000);
        swapToggle = createRowToggle(rows1000, swappedRows, 'initial');
      },
      teardown() {
        app?.cleanup();
        app = null;
        swapToggle = null;
      },
    }
  );

  bench(
    'remove one row in the JSX app',
    () => {
      app!.setRows(removeToggle!.next() as RowData[]);
    },
    {
      ...tier4BenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(rows1000);
        removeToggle = createRowToggle(rows1000, removedRows, 'initial');
      },
      teardown() {
        app?.cleanup();
        app = null;
        removeToggle = null;
      },
    }
  );

  bench(
    'append 1,000 rows in the JSX app',
    () => {
      app!.setRows(appendToggle!.next() as RowData[]);
    },
    {
      ...tier4BenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(rows1000);
        appendToggle = createRowToggle(rows1000, rows2000, 'initial');
      },
      teardown() {
        app?.cleanup();
        app = null;
        appendToggle = null;
      },
    }
  );

  bench(
    'clear all rows in the JSX app',
    () => {
      app!.setRows(clearToggle!.next() as RowData[]);
    },
    {
      ...tier4BenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(rows1000);
        clearToggle = createRowToggle(rows1000, emptyRows, 'initial');
      },
      teardown() {
        app?.cleanup();
        app = null;
        clearToggle = null;
      },
    }
  );
});
