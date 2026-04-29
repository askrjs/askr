import { expect } from 'vite-plus/test';
import { test } from 'vite-plus/test';
import { createIsland, selector, state } from '../../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { For } from '../../../src/control';

interface RowData {
  id: number;
  label: string;
}

function Row({
  item,
  isSelected,
  onSelect,
}: {
  item: RowData;
  isSelected: (candidate: number) => boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <tr class={() => (isSelected(item.id) ? 'danger' : '')}>
      <td>{item.id}</td>
      <td>
        <a
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            onSelect(item.id);
          }}
        >
          {item.label}
        </a>
      </td>
    </tr>
  );
}

test(
  'should apply danger class in production when clicking row',
  { timeout: 20000 },
  () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const { container, cleanup } = createTestContainer();
    let dataState!: ReturnType<typeof state<RowData[]>>;
    let selectedState!: ReturnType<typeof state<number | null>>;

    const App = () => {
      dataState = state<RowData[]>([]);
      selectedState = state<number | null>(null);
      const isSelected = selector(selectedState);

      const _remove = (_: number) => undefined;
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

    // create a few rows
    dataState.set([
      { id: 1, label: 'Item 1' },
      { id: 2, label: 'Item 2' },
      { id: 3, label: 'Item 3' },
    ]);
    flushScheduler();

    const tbody = container.querySelector('tbody')!;
    const rows = tbody.querySelectorAll('tr');
    expect(rows.length).to.equal(3);

    // Click second row anchor
    const link = rows[1].querySelector('a')!;
    // Simulate user click
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    flushScheduler();

    // Expect class applied
    expect(rows[1].className).to.equal('danger');

    cleanup();
    process.env.NODE_ENV = prev;
  }
);

// Non-keyed variant: For without "by" option and no key prop set on rows
test(
  'should apply danger class in production for unkeyed For when clicking row',
  { timeout: 20000 },
  () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const { container, cleanup } = createTestContainer();
    let dataState!: ReturnType<typeof state<RowData[]>>;
    let selectedState!: ReturnType<typeof state<number | null>>;

    const App = () => {
      dataState = state<RowData[]>([]);
      selectedState = state<number | null>(null);
      const isSelected = selector(selectedState);

      const select = (id: number) => selectedState.set(id);

      return (
        <div>
          <table>
            <tbody>
              {
                <For each={() => dataState()} by={(item) => item.id}>
                  {(item) => (
                    <tr class={() => (isSelected(item.id) ? 'danger' : '')}>
                      <td>{item.id}</td>
                      <td>
                        <a
                          onClick={(e: MouseEvent) => {
                            e.preventDefault();
                            select(item.id);
                          }}
                        >
                          {item.label}
                        </a>
                      </td>
                    </tr>
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

    // create a few rows
    dataState.set([
      { id: 1, label: 'Item 1' },
      { id: 2, label: 'Item 2' },
      { id: 3, label: 'Item 3' },
    ]);
    flushScheduler();

    const tbody2 = container.querySelector('tbody')!;
    const rows2 = tbody2.querySelectorAll('tr');
    expect(rows2.length).to.equal(3);

    // Click second row anchor
    const link2 = rows2[1].querySelector('a')!;
    link2.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    flushScheduler();

    // Expect class applied
    expect(rows2[1].className).to.equal('danger');

    cleanup();
    process.env.NODE_ENV = prev;
  }
);
