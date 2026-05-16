import { bench, describe } from 'vite-plus/test';
import { createIsland } from '../../src/boot';
import { BenchmarkTable } from '../../src/bench/components/benchmark-table';
import { selector, state, type State } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import type { BenchToggle, RowData } from '../shared/_shared';
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
  extendBenchOptions,
  removeRowById,
  replaceAllRows,
  swapRows,
  tier4BenchOptions,
  updateEveryNthRow,
} from '../shared/_shared';

const jsxAppBenchOptions = extendBenchOptions(tier4BenchOptions, {
  time: 2500,
  iterations: 2,
  warmupTime: 250,
  warmupIterations: 1,
});

const jsxAppSlowBenchOptions = extendBenchOptions(tier4BenchOptions, {
  time: 3000,
  iterations: 3,
  warmupTime: 250,
  warmupIterations: 1,
});

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
const replacedRows = replaceAllRows(rows1000);

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

    const replaceToggle = createRowToggle(rows1000, replacedRows, 'initial');
    assertToggleMutationGuard(
      app.container,
      () => {
        app.setRows(replaceToggle.next() as RowData[]);
      },
      () => {
        app.setRows(replaceToggle.next() as RowData[]);
      },
      {
        label: 'tier4 jsx replace all',
        afterForward: () => {
          assertRowCountTransition(app.container, 1000);
          assertOrderTransition(
            app.container,
            replacedRows.map((row) => row.id)
          );
        },
        afterBackward: () => {
          assertRowCountTransition(app.container, 1000);
          assertOrderTransition(
            app.container,
            rows1000.map((row) => row.id)
          );
        },
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

    app.clickRow(498);
    assertSelectionTransition(app.container, 498);

    const selectedAppendToggle = createRowToggle(rows1000, rows2000, 'initial');
    assertToggleMutationGuard(
      app.container,
      () => {
        app.setRows(selectedAppendToggle.next() as RowData[]);
      },
      () => {
        app.setRows(selectedAppendToggle.next() as RowData[]);
      },
      {
        label: 'tier4 jsx append with selection',
        afterForward: () => {
          assertRowCountTransition(app.container, 2000);
          assertSelectionTransition(app.container, 498);
        },
        afterBackward: () => {
          assertRowCountTransition(app.container, 1000);
          assertSelectionTransition(app.container, 498);
        },
      }
    );

    const selectedRemoveToggle = createRowToggle(
      rows1000,
      removedRows,
      'initial'
    );
    assertToggleMutationGuard(
      app.container,
      () => {
        app.setRows(selectedRemoveToggle.next() as RowData[]);
      },
      () => {
        app.setRows(selectedRemoveToggle.next() as RowData[]);
      },
      {
        label: 'tier4 jsx remove with selection',
        afterForward: () => {
          assertRowCountTransition(app.container, 999);
          assertSelectionTransition(app.container, 498);
        },
        afterBackward: () => {
          assertRowCountTransition(app.container, 1000);
          assertSelectionTransition(app.container, 498);
        },
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
  let selectToggle: BenchToggle<number> | null = null;
  let updateToggle: BenchToggle<readonly RowData[]> | null = null;
  let swapToggle: BenchToggle<readonly RowData[]> | null = null;
  let replaceToggle: BenchToggle<readonly RowData[]> | null = null;
  let selectedSwapToggle: BenchToggle<readonly RowData[]> | null = null;
  let removeToggle: BenchToggle<readonly RowData[]> | null = null;

  bench(
    'create 1,000 rows in the JSX app',
    () => {
      app!.setRows(rows1000);
    },
    {
      ...jsxAppBenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(emptyRows);
      },
      teardown() {
        app?.cleanup();
        app = null;
      },
    }
  );

  bench(
    'select one row through the JSX app click path',
    () => {
      app!.clickRow(selectToggle!.next());
    },
    {
      ...jsxAppBenchOptions,
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
      ...jsxAppBenchOptions,
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
    'replace all rows in the JSX app',
    () => {
      app!.setRows(replaceToggle!.next() as RowData[]);
    },
    {
      ...jsxAppSlowBenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(rows1000);
        replaceToggle = createRowToggle(rows1000, replacedRows, 'initial');
      },
      teardown() {
        app?.cleanup();
        app = null;
        replaceToggle = null;
      },
    }
  );

  bench(
    'swap distant rows with selection in the JSX app',
    () => {
      app!.setRows(selectedSwapToggle!.next() as RowData[]);
    },
    {
      ...tier4BenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(rows1000);
        selectedSwapToggle = createRowToggle(rows1000, swappedRows, 'initial');
        app.clickRow(1);
      },
      teardown() {
        app?.cleanup();
        app = null;
        selectedSwapToggle = null;
      },
    }
  );

  bench(
    'remove one row in the JSX app',
    () => {
      app!.setRows(removeToggle!.next() as RowData[]);
    },
    {
      ...jsxAppSlowBenchOptions,
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
      app!.setRows(rows2000);
    },
    {
      ...tier4BenchOptions,
      setup() {
        bench(
          'append 1,000 rows with selection in the JSX app',
          () => {
            app!.setRows(rows2000);
          },
          {
            ...tier4BenchOptions,
            setup() {
              app = mountJsxBenchmarkApp(rows1000);
              app.setRows(rows1000);
              app.clickRow(498);
            },
            teardown() {
              app?.cleanup();
              app = null;
            },
          }
        );
        app = mountJsxBenchmarkApp(rows1000);
      },
      teardown() {
        app?.cleanup();
        app = null;
      },
    }
  );

  bench(
    'clear all rows in the JSX app',
    () => {
      app!.setRows(emptyRows);
    },
    {
      ...tier4BenchOptions,
      setup() {
        app = mountJsxBenchmarkApp(rows1000);
      },
      teardown() {
        app?.cleanup();
        app = null;
      },
    }
  );
});
