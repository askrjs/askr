import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland, derive, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

interface RowData {
  id: number;
  label: string;
}

function Row({
  item,
  selected,
  onSelect,
}: {
  item: RowData;
  selected: () => number | null;
  onSelect: (id: number) => void;
}) {
  const isSelected = derive(selected, (value) => value === item.id);

  return (
    <tr class={() => (isSelected() ? 'danger' : '')}>
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

      const _remove = (_: number) => undefined;
      const select = (id: number) => selectedState.set(id);

      return (
        <div>
          <table>
            <tbody>
              {For(
                () => dataState(),
                (item) => item.id,
                (item) => (
                  <Row item={item} selected={selectedState} onSelect={select} />
                )
              )}
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

      const select = (id: number) => selectedState.set(id);

      return (
        <div>
          <table>
            <tbody>
              {For(
                () => dataState(),
                (item) => item.id,
                (item) => {
                  const isSelected = derive(
                    selectedState,
                    (value) => value === item.id
                  );

                  return (
                    <tr class={() => (isSelected() ? 'danger' : '')}>
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
                  );
                }
              )}
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
