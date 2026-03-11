/* eslint-disable @typescript-eslint/no-explicit-any */
import { createIsland, selector, state, State } from '../index';
import { For } from '../for';
import { globalScheduler } from '../runtime/scheduler';

type RowData = { id: number; label: string };

export function mountBenchmark(root: Element, initialRows?: RowData[]) {
  const initialRowsTyped: RowData[] = Array.isArray(initialRows)
    ? initialRows
    : [];
  let dataState!: State<RowData[]>;
  let selectedState!: State<number | null>;

  const App = () => {
    dataState = state<RowData[]>([]);
    selectedState = state<number | null>(null);
    const isSelected = selector(selectedState);

    const select = (id: number) => selectedState.set(id);

    return {
      type: 'div',
      props: {},
      children: [
        {
          type: 'table',
          props: {},
          children: [
            {
              type: 'tbody',
              props: {},
              children: [
                For(
                  () => dataState(),
                  (item: RowData) => item.id,
                  (item: RowData) => {
                    return {
                      type: 'tr',
                      props: {
                        class: () => (isSelected(item.id) ? 'danger' : ''),
                      },
                      children: [
                        {
                          type: 'td',
                          props: { class: 'col-md-1' },
                          children: [String(item.id)],
                        },
                        {
                          type: 'td',
                          props: {
                            class: 'col-md-4',
                            onClick: (e: MouseEvent) => {
                              e.preventDefault();
                              select(item.id);
                            },
                          },
                          children: [
                            {
                              type: 'a',
                              props: {
                                class: 'lbl',
                                onClick: (e: MouseEvent) => {
                                  e.preventDefault();
                                  select(item.id);
                                },
                              },
                              children: [item.label],
                            },
                          ],
                        },
                        {
                          type: 'td',
                          props: { class: 'col-md-1' },
                          children: [
                            {
                              type: 'a',
                              props: {
                                class: 'remove',
                                onClick: (e: MouseEvent) => {
                                  e.preventDefault();
                                },
                              },
                              children: [
                                {
                                  type: 'span',
                                  props: {
                                    class: 'glyphicon glyphicon-remove',
                                    'aria-hidden': 'true',
                                  },
                                  children: [],
                                },
                              ],
                            },
                          ],
                        },
                        {
                          type: 'td',
                          props: { class: 'col-md-6' },
                          children: [],
                        },
                      ],
                    };
                  }
                ),
              ],
            },
          ],
        },
      ],
    };
  };

  createIsland({ root, component: App as any });

  if (initialRowsTyped.length > 0 && dataState) dataState.set(initialRowsTyped);

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
