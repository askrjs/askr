import { expect, test } from 'vite-plus/test';
import { selector, state } from '../../../src';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';
import type { State } from '../../../src';

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

test('should append rows with JSX', { timeout: 150000 }, () => {
  const { container, cleanup } = createTestContainer();
  let dataState!: State<RowData[]>;

  const App = () => {
    dataState = state<RowData[]>(buildData(1000));
    const selectedState = state<number | null>(null);
    const isSelected = selector(selectedState);

    const remove = (id: number) =>
      dataState.set((rows) => rows.filter((item) => item.id !== id));
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

  const tbody = container.querySelector('tbody');
  if (!tbody) {
    throw new Error('tbody not found');
  }

  expect(tbody.querySelectorAll('tr').length).to.equal(1000);

  dataState.set((rows) => rows.concat(buildData(1000, 1001)));
  flushScheduler();

  const renderedRows = tbody.querySelectorAll('tr');
  expect(renderedRows.length).to.equal(2000);

  const lastCells = renderedRows[1999].querySelectorAll('td');
  expect(lastCells[0].textContent).to.equal('2000');
  expect(lastCells[1].textContent).to.equal('Item 2000');

  cleanup();
});
