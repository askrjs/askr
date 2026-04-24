/**
 * Complete JSX benchmark test matching js-framework-benchmark structure
 * This test verifies that JSX syntax works with For, nested components, and event handlers
 */
import { expect } from 'chai';
import { test, describe } from 'vite-plus/test';
import { createIsland, selector, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';
import type { State } from '../../src';

interface RowData {
  id: number;
  label: string;
}

interface RowProps {
  item: RowData;
  isSelected: (candidate: number) => boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}

function Row({ item, isSelected, onSelect, onRemove }: RowProps) {
  return (
    <tr class={() => (isSelected(item.id) ? 'danger' : '')}>
      <td class="col-md-1">{item.id}</td>
      <td class="col-md-4">
        <a
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            onSelect(item.id);
          }}
        >
          {item.label}
        </a>
      </td>
      <td class="col-md-1">
        <a
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            onRemove(item.id);
          }}
        >
          <span class="remove-icon">×</span>
        </a>
      </td>
    </tr>
  );
}

function buildData(count: number, startId: number = 1): RowData[] {
  const data: RowData[] = [];
  for (let i = 0; i < count; i++) {
    data.push({
      id: startId + i,
      label: `Item ${startId + i}`,
    });
  }
  return data;
}

describe(
  'JSX benchmark complete (matches js-framework-benchmark)',
  { timeout: 20000 },
  () => {
    test('should render 1000 rows with JSX components', () => {
      const { container, cleanup } = createTestContainer();
      let dataState!: State<RowData[]>;
      let selectedState!: State<number | null>;

      const App = () => {
        dataState = state<RowData[]>([]);
        selectedState = state<number | null>(null);
        const isSelected = selector(selectedState);

        const remove = (id: number) =>
          dataState.set((d) => d.filter((it) => it.id !== id));
        const select = (id: number) => selectedState.set(id);

        return (
          <div class="container">
            <table class="table">
              <tbody>
                {
                  <For each={() => dataState()} by={(item) => item.id}>
                    {(item) => (
                      <Row
                        item={item}
                        isSelected={isSelected}
                        onSelect={select}
                        onRemove={remove}
                      />
                    )}
                  </For>
                }
              </tbody>
            </table>
          </div>
        );
      };

      createIsland({ root: container, component: App });
      flushScheduler();

      // Create 1000 rows
      dataState.set(buildData(1000));
      flushScheduler();

      const tbody = container.querySelector('tbody');
      void expect(tbody).to.not.be.null;
      const rows = tbody!.querySelectorAll('tr');
      expect(rows.length).to.equal(1000);

      // Verify first row
      const firstCells = rows[0].querySelectorAll('td');
      expect(firstCells[0].textContent).to.equal('1');
      expect(firstCells[1].textContent).to.equal('Item 1');

      cleanup();
    });

    test('should handle selection with JSX', () => {
      const { container, cleanup } = createTestContainer();

      const App = () => {
        const dataState = state<RowData[]>(buildData(10));
        const selectedState = state<number | null>(null);
        const isSelected = selector(selectedState);

        const remove = (id: number) =>
          dataState.set((d) => d.filter((it) => it.id !== id));
        const select = (id: number) => selectedState.set(id);

        return (
          <div>
            <table>
              <tbody>
                {
                  <For each={() => dataState()} by={(item) => item.id}>
                    {(item) => (
                      <Row
                        item={item}
                        isSelected={isSelected}
                        onSelect={select}
                        onRemove={remove}
                      />
                    )}
                  </For>
                }
              </tbody>
            </table>
          </div>
        );
      };

      createIsland({ root: container, component: App });
      flushScheduler();

      const tbody = container.querySelector('tbody')!;
      let rows = tbody.querySelectorAll('tr');
      expect(rows.length).to.equal(10);

      // Select row 5 by clicking
      const row5Link = rows[4].querySelector('a')!;
      row5Link.click();
      flushScheduler();

      rows = tbody.querySelectorAll('tr');
      expect(rows.length).to.equal(10);
      expect(rows[4].className).to.equal('danger');
      expect(rows[0].className).to.equal('');

      // Change selection to row 2 by clicking
      const row2Link = rows[1].querySelector('a')!;
      row2Link.click();
      flushScheduler();

      rows = tbody.querySelectorAll('tr');
      expect(rows[1].className).to.equal('danger');
      expect(rows[4].className).to.equal('');

      cleanup();
    });

    test('should update every 10th row with JSX', () => {
      const { container, cleanup } = createTestContainer();
      let dataState!: State<RowData[]>;

      const App = () => {
        dataState = state<RowData[]>(buildData(100));
        const selectedState = state<number | null>(null);
        const isSelected = selector(selectedState);

        const remove = (id: number) =>
          dataState.set((d) => d.filter((it) => it.id !== id));
        const select = (id: number) => selectedState.set(id);

        return (
          <table>
            <tbody>
              {
                <For each={() => dataState()} by={(item) => item.id}>
                  {(item) => (
                    <Row
                      item={item}
                      isSelected={isSelected}
                      onSelect={select}
                      onRemove={remove}
                    />
                  )}
                </For>
              }
            </tbody>
          </table>
        );
      };

      createIsland({ root: container, component: App });
      flushScheduler();

      // Update every 10th row
      dataState.set((d) =>
        d.map((it, i) =>
          i % 10 === 0 ? { ...it, label: it.label + ' !!!' } : it
        )
      );
      flushScheduler();

      const tbody = container.querySelector('tbody')!;
      const rows = tbody.querySelectorAll('tr');

      // Check updated rows
      expect(rows[0].querySelectorAll('td')[1].textContent).to.equal(
        'Item 1 !!!'
      );
      expect(rows[10].querySelectorAll('td')[1].textContent).to.equal(
        'Item 11 !!!'
      );
      // Check non-updated row
      expect(rows[1].querySelectorAll('td')[1].textContent).to.equal('Item 2');

      cleanup();
    });

    test('should swap rows with JSX', () => {
      const { container, cleanup } = createTestContainer();
      let dataState!: State<RowData[]>;

      const App = () => {
        dataState = state<RowData[]>(buildData(1000));
        const selectedState = state<number | null>(null);
        const isSelected = selector(selectedState);

        const remove = (id: number) =>
          dataState.set((d) => d.filter((it) => it.id !== id));
        const select = (id: number) => selectedState.set(id);

        return (
          <table>
            <tbody>
              {
                <For each={() => dataState()} by={(item) => item.id}>
                  {(item) => (
                    <Row
                      item={item}
                      isSelected={isSelected}
                      onSelect={select}
                      onRemove={remove}
                    />
                  )}
                </For>
              }
            </tbody>
          </table>
        );
      };

      createIsland({ root: container, component: App });
      flushScheduler();

      const tbody = container.querySelector('tbody')!;
      let rows = tbody.querySelectorAll('tr');

      // Capture DOM nodes for identity check
      const row1 = rows[1];
      const row998 = rows[998];

      // Swap rows at indices 1 and 998
      dataState.set((d) => {
        if (d.length > 998) {
          const copy = d.slice();
          const tmp = copy[1];
          copy[1] = copy[998];
          copy[998] = tmp;
          return copy;
        }
        return d;
      });
      flushScheduler();

      rows = tbody.querySelectorAll('tr');

      // Verify swap
      expect(rows[1].querySelectorAll('td')[1].textContent).to.equal(
        'Item 999'
      );
      expect(rows[998].querySelectorAll('td')[1].textContent).to.equal(
        'Item 2'
      );

      // Verify DOM identity preserved
      expect(rows[998]).to.equal(row1);
      expect(rows[1]).to.equal(row998);

      cleanup();
    });

    test('should remove row via callback with JSX', () => {
      const { container, cleanup } = createTestContainer();
      let dataState!: State<RowData[]>;
      let removeCalled = 0;

      const App = () => {
        dataState = state<RowData[]>(buildData(10));
        const selectedState = state<number | null>(null);
        const isSelected = selector(selectedState);

        const remove = (id: number) => {
          removeCalled++;
          dataState.set((d) => d.filter((it) => it.id !== id));
        };
        const select = (id: number) => selectedState.set(id);

        return (
          <table>
            <tbody>
              {
                <For each={() => dataState()} by={(item) => item.id}>
                  {(item) => (
                    <Row
                      item={item}
                      isSelected={isSelected}
                      onSelect={select}
                      onRemove={remove}
                    />
                  )}
                </For>
              }
            </tbody>
          </table>
        );
      };

      createIsland({ root: container, component: App });
      flushScheduler();

      const tbody = container.querySelector('tbody')!;
      expect(tbody.querySelectorAll('tr').length).to.equal(10);

      // Simulate clicking remove on row 5
      const removeLink = tbody
        .querySelectorAll('tr')[4]
        .querySelector('td:last-child a');
      void expect(removeLink).to.not.be.null;

      // Trigger the same callback path the component uses.
      (removeLink as HTMLAnchorElement).click();
      flushScheduler();

      const rows = tbody.querySelectorAll('tr');
      expect(rows.length).to.equal(9);
      expect(removeCalled).to.equal(1);

      // Verify row 5 is gone and order is preserved
      const ids = Array.from(rows).map(
        (r) => r.querySelectorAll('td')[0].textContent
      );
      expect(ids).to.deep.equal(['1', '2', '3', '4', '6', '7', '8', '9', '10']);

      cleanup();
    });

    test('should append rows with JSX', () => {
      const { container, cleanup } = createTestContainer();
      let dataState!: State<RowData[]>;

      const App = () => {
        dataState = state<RowData[]>(buildData(1000));
        const selectedState = state<number | null>(null);
        const isSelected = selector(selectedState);

        const remove = (id: number) =>
          dataState.set((d) => d.filter((it) => it.id !== id));
        const select = (id: number) => selectedState.set(id);

        return (
          <table>
            <tbody>
              {
                <For each={() => dataState()} by={(item) => item.id}>
                  {(item) => (
                    <Row
                      item={item}
                      isSelected={isSelected}
                      onSelect={select}
                      onRemove={remove}
                    />
                  )}
                </For>
              }
            </tbody>
          </table>
        );
      };

      createIsland({ root: container, component: App });
      flushScheduler();

      const tbody = container.querySelector('tbody')!;
      expect(tbody.querySelectorAll('tr').length).to.equal(1000);

      // Append 1000 more rows
      dataState.set((d) => d.concat(buildData(1000, 1001)));
      flushScheduler();

      const rows = tbody.querySelectorAll('tr');
      expect(rows.length).to.equal(2000);

      // Verify last row
      const lastCells = rows[1999].querySelectorAll('td');
      expect(lastCells[0].textContent).to.equal('2000');
      expect(lastCells[1].textContent).to.equal('Item 2000');

      cleanup();
    });

    test('should clear all rows with JSX', () => {
      const { container, cleanup } = createTestContainer();
      let dataState!: State<RowData[]>;

      const App = () => {
        dataState = state<RowData[]>(buildData(1000));
        const selectedState = state<number | null>(null);
        const isSelected = selector(selectedState);

        const remove = (id: number) =>
          dataState.set((d) => d.filter((it) => it.id !== id));
        const select = (id: number) => selectedState.set(id);

        return (
          <table>
            <tbody>
              {
                <For each={() => dataState()} by={(item) => item.id}>
                  {(item) => (
                    <Row
                      item={item}
                      isSelected={isSelected}
                      onSelect={select}
                      onRemove={remove}
                    />
                  )}
                </For>
              }
            </tbody>
          </table>
        );
      };

      createIsland({ root: container, component: App });
      flushScheduler();

      const tbody = container.querySelector('tbody')!;
      expect(tbody.querySelectorAll('tr').length).to.equal(1000);

      // Clear all
      dataState.set([]);
      flushScheduler();

      expect(tbody.querySelectorAll('tr').length).to.equal(0);

      cleanup();
    });
  }
);
