/* eslint-disable @typescript-eslint/no-explicit-any */
import { createIsland } from '../boot';
import { installRendererBridge } from '../renderer';
import { selector } from '../runtime/selector';
import { state, State } from '../runtime/state';
import { globalScheduler } from '../runtime/scheduler';
import { BenchmarkTable } from './components/benchmark-table';
import type { BenchmarkRowData } from './components/benchmark-row';

installRendererBridge();

type RowData = BenchmarkRowData;

export function mountBenchmark(root: Element, initialRows?: RowData[]) {
  const initialRowsTyped: RowData[] = Array.isArray(initialRows)
    ? initialRows
    : [];
  let dataState!: State<RowData[]>;
  let selectedState!: State<number | null>;

  const App = () => {
    dataState = state<RowData[]>(initialRowsTyped);
    selectedState = state<number | null>(null);
    const isSelected = selector(selectedState);

    const select = (id: number) => selectedState.set(id);
    const remove = (id: number) => {
      dataState.set((rows) => rows.filter((item) => item.id !== id));
      selectedState.set((selected) => (selected === id ? null : selected));
    };

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

  createIsland({ root, component: App as any });

  return {
    setRows(rows: RowData[]) {
      dataState.set(rows);
      // Ensure work is flushed so external harnesses (like JFB) that check the DOM
      // immediately after calling `setRows` observe the committed DOM.
      globalScheduler.flush();
    },
    setSelected(id: number | null) {
      selectedState.set(id);
      globalScheduler.flush();
    },
    cleanup() {
      // nothing to do; outer test may clean the container
    },
  };
}

export default { mountBenchmark };
