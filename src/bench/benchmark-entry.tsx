/* eslint-disable @typescript-eslint/no-explicit-any */
import { createIsland } from '../boot';
import { installRendererBridge } from '../boot/runtime-wiring';
import { flushRuntimeScheduler } from '../runtime';
import { selector } from '../runtime';
import { state, State } from '../runtime';
import { BenchmarkTable } from './components/benchmark-table';
import type { BenchmarkRowData } from './components/benchmark-row';

installRendererBridge();

type RowData = BenchmarkRowData;

export interface BenchmarkMetadata {
  packageName: string;
  packageVersion: string;
  buildLabel: string;
}

const packageName =
  process.env.ASKR_PACKAGE_NAME ||
  process.env.npm_package_name ||
  '@askrjs/askr';
const packageVersion =
  process.env.ASKR_PACKAGE_VERSION ||
  process.env.npm_package_version ||
  '0.0.0';

export const benchmarkMetadata: BenchmarkMetadata = {
  packageName,
  packageVersion,
  buildLabel:
    process.env.ASKR_BENCHMARK_BUILD_LABEL || `${packageVersion}-local`,
};

export function getBenchmarkMetadata(): BenchmarkMetadata {
  return { ...benchmarkMetadata };
}

export function mountBenchmark(root: Element, initialRows?: RowData[]) {
  const initialRowsTyped: RowData[] = Array.isArray(initialRows)
    ? initialRows
    : [];
  let dataState!: State<RowData[]>;
  let selectedState!: State<number | null>;

  const App = () => {
    dataState = state<RowData[]>(initialRowsTyped);
    selectedState = state<number | null>(null);
    dataState._hasBeenRead = true;
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
  flushRuntimeScheduler();

  return {
    setRows(rows: RowData[]) {
      dataState.set(rows);
      // Ensure work is flushed so external harnesses (like JFB) that check the DOM
      // immediately after calling `setRows` observe the committed DOM.
      flushRuntimeScheduler();
    },
    setSelected(id: number | null) {
      selectedState.set(id);
      flushRuntimeScheduler();
    },
    cleanup() {
      // nothing to do; outer test may clean the container
    },
  };
}

export default { mountBenchmark };
