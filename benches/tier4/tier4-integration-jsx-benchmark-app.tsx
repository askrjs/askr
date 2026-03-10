import { bench, describe, expect } from 'vitest';
import { createIsland, selector, state, type State } from '../../src';
import { For } from '../../src/for';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';
import {
  buildRows,
  removeRowById,
  swapRows,
  tier4BenchOptions,
  updateEveryNthRow,
} from '../shared/_shared';

interface RowProps {
  item: { id: number; label: string };
  isSelected: (candidate: number) => boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}

function Row({ item, isSelected, onSelect, onRemove }: RowProps) {
  return (
    <tr class={() => (isSelected(item.id) ? 'danger' : '')}>
      <td>{item.id}</td>
      <td>
        <a
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            onSelect(item.id);
          }}
        >
          {item.label}
        </a>
      </td>
      <td>
        <a
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            onRemove(item.id);
          }}
        >
          remove
        </a>
      </td>
    </tr>
  );
}

function mountJsxBenchmarkApp(
  initialRows: Array<{ id: number; label: string }>
) {
  const { container, cleanup } = createTestContainer();
  let dataState!: State<Array<{ id: number; label: string }>>;
  let selectedState!: State<number | null>;
  let primaryLinks: HTMLElement[] | null = null;

  function getPrimaryLinks(): HTMLElement[] {
    if (primaryLinks) {
      return primaryLinks;
    }

    primaryLinks = Array.from(
      container.querySelectorAll('tbody tr td:nth-child(2) a')
    ) as HTMLElement[];

    return primaryLinks;
  }

  const App = () => {
    dataState = state(initialRows);
    selectedState = state<number | null>(null);
    const isSelected = selector(selectedState);

    const remove = (id: number) =>
      dataState.set((rows) => rows.filter((row) => row.id !== id));
    const select = (id: number) => selectedState.set(id);

    return (
      <div class="container">
        <table>
          <tbody>
            {For(
              () => dataState(),
              (item) => item.id,
              (item) => (
                <Row
                  item={item}
                  isSelected={isSelected}
                  onSelect={select}
                  onRemove={remove}
                />
              )
            )}
          </tbody>
        </table>
      </div>
    );
  };

  createIsland({ root: container, component: App });
  flushScheduler();

  return {
    container,
    cleanup,
    setRows(rows: Array<{ id: number; label: string }>) {
      dataState.set(rows);
      flushScheduler();
      primaryLinks = null;
    },
    clickRow(index: number) {
      getPrimaryLinks()[index].dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true })
      );
      flushScheduler();
    },
  };
}

const rows1000 = buildRows(1000);
const rows2000 = buildRows(2000);
const updatedRows = updateEveryNthRow(rows1000);
const swappedRows = swapRows(rows1000, 1, 998);
const removedRows = removeRowById(rows1000, 500);

{
  const app = mountJsxBenchmarkApp(rows1000);
  try {
    app.clickRow(1);
    expect(app.container.querySelectorAll('tr')[1].className).toBe('danger');
    app.setRows(updatedRows);
    expect(app.container.querySelectorAll('tr')[0].textContent).toContain(
      'Item 1 !!!'
    );
  } finally {
    app.cleanup();
  }
}

describe('tier4 integration jsx benchmark app', () => {
  let app: ReturnType<typeof mountJsxBenchmarkApp> | null = null;

  bench(
    'create 1,000 rows in the JSX app',
    () => {
      app!.setRows(rows1000);
    },
    {
      ...tier4BenchOptions,
      setup() {
        app = mountJsxBenchmarkApp([]);
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
      app!.clickRow(499);
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

  bench(
    'update every 10th row in the JSX app',
    () => {
      app!.setRows(updatedRows);
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

  bench(
    'swap distant rows in the JSX app',
    () => {
      app!.setRows(swappedRows);
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

  bench(
    'remove one row in the JSX app',
    () => {
      app!.setRows(removedRows);
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

  bench(
    'append 1,000 rows in the JSX app',
    () => {
      app!.setRows(rows2000);
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

  bench(
    'clear all rows in the JSX app',
    () => {
      app!.setRows([]);
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
