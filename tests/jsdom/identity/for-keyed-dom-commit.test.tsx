import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { For } from '../../../src/control';
import { selector, state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

function getDomReplaceCount(): number {
  const devNamespace =
    (
      globalThis as Record<string, unknown> & {
        __ASKR__?: Record<string, unknown>;
      }
    ).__ASKR__ ?? {};

  return typeof devNamespace.__DOM_REPLACE_COUNT === 'number'
    ? (devNamespace.__DOM_REPLACE_COUNT as number)
    : 0;
}

function interleaveRows<T>(rows: readonly T[]): T[] {
  const evenRows: T[] = [];
  const oddRows: T[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (index % 2 === 0) {
      evenRows.push(row);
    } else {
      oddRows.push(row);
    }
  }

  return [...evenRows, ...oddRows];
}

describe('for keyed DOM commit', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should update keyed selection without replacing the parent subtree', () => {
    let selectedState: ReturnType<typeof state<number | null>> | null = null;

    const Component = () => {
      const rowsState = state([
        { id: 1, label: 'Row 1' },
        { id: 2, label: 'Row 2' },
        { id: 3, label: 'Row 3' },
      ]);
      selectedState = state<number | null>(null);
      const isSelected = selector(selectedState);

      return (
        <table>
          <tbody>
            {
              <For each={() => rowsState!()} by={(item) => item.id}>
                {(item) => (
                  <tr class={() => (isSelected(item.id) ? 'danger' : '')}>
                    <td>{item.label}</td>
                  </tr>
                )}
              </For>
            }
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const row1Before = container.querySelector('[data-key="1"]');
    const row2Before = container.querySelector('[data-key="2"]');
    const row3Before = container.querySelector('[data-key="3"]');
    const replaceBefore = getDomReplaceCount();

    selectedState!.set(2);
    flushScheduler();

    expect(container.querySelector('[data-key="1"]')).toBe(row1Before);
    expect(container.querySelector('[data-key="2"]')).toBe(row2Before);
    expect(container.querySelector('[data-key="3"]')).toBe(row3Before);
    expect((row2Before as HTMLElement).className).toBe('danger');

    selectedState!.set(3);
    flushScheduler();

    expect(container.querySelector('[data-key="1"]')).toBe(row1Before);
    expect(container.querySelector('[data-key="2"]')).toBe(row2Before);
    expect(container.querySelector('[data-key="3"]')).toBe(row3Before);
    expect((row2Before as HTMLElement).className).toBe('');
    expect((row3Before as HTMLElement).className).toBe('danger');
    expect(getDomReplaceCount() - replaceBefore).toBe(0);
  });

  it('should replace all keyed rows with new DOM nodes when every key changes', () => {
    type RowData = { id: number; label: string };

    let rowsState: ReturnType<typeof state<RowData[]>> | null = null;

    const Component = () => {
      rowsState = state<RowData[]>([
        { id: 1, label: 'One' },
        { id: 2, label: 'Two' },
        { id: 3, label: 'Three' },
      ]);

      return (
        <table>
          <tbody>
            {
              <For each={() => rowsState!()} by={(item) => item.id}>
                {(item) => (
                  <tr>
                    <td>{item.label}</td>
                  </tr>
                )}
              </For>
            }
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const firstRowBefore = container.querySelector('tr[data-key="1"]');
    expect(firstRowBefore?.textContent).toContain('One');

    rowsState!.set([
      { id: 11, label: 'Eleven' },
      { id: 12, label: 'Twelve' },
      { id: 13, label: 'Thirteen' },
    ]);
    flushScheduler();

    const firstRowAfter = container.querySelector('tr[data-key="11"]');
    expect(firstRowAfter?.textContent).toContain('Eleven');
    expect(firstRowAfter).not.toBe(firstRowBefore);
    expect(container.querySelector('tr[data-key="1"]')).toBeNull();
  });

  it('should keep keyed row identity for same-order updates', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const Component = () => {
      rowsState = state(
        Array.from({ length: 20 }, (_, index) => ({
          id: index + 1,
          label: `Row ${index + 1}`,
        }))
      );

      return (
        <table>
          <tbody>
            {
              <For each={() => rowsState!()} by={(item) => item.id}>
                {(item) => (
                  <tr>
                    <td>{item.label}</td>
                  </tr>
                )}
              </For>
            }
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const rowsBefore = new Map<string, Element>();
    container.querySelectorAll('tr[data-key]').forEach((row) => {
      rowsBefore.set(row.getAttribute('data-key') || '', row);
    });
    const replaceBefore = getDomReplaceCount();

    rowsState!.set((rows) =>
      rows.map((item, index) =>
        index % 10 === 0 ? { ...item, label: `${item.label} !!!` } : item
      )
    );
    flushScheduler();

    container.querySelectorAll('tr[data-key]').forEach((row) => {
      const key = row.getAttribute('data-key') || '';
      expect(row).toBe(rowsBefore.get(key));
    });

    expect(container.querySelector('tr[data-key="1"] td')?.textContent).toBe(
      'Row 1 !!!'
    );
    expect(container.querySelector('tr[data-key="2"] td')?.textContent).toBe(
      'Row 2'
    );
    expect(container.querySelector('tr[data-key="11"] td')?.textContent).toBe(
      'Row 11 !!!'
    );
    expect(getDomReplaceCount() - replaceBefore).toBe(0);
  });

  it('should reorder keyed rows without recreating them', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const Component = () => {
      rowsState = state([
        { id: 1, label: 'Row 1' },
        { id: 2, label: 'Row 2' },
        { id: 3, label: 'Row 3' },
        { id: 4, label: 'Row 4' },
        { id: 5, label: 'Row 5' },
      ]);

      return (
        <table>
          <tbody>
            {
              <For each={() => rowsState!()} by={(item) => item.id}>
                {(item) => (
                  <tr>
                    <td>{item.label}</td>
                  </tr>
                )}
              </For>
            }
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const rowsBefore = new Map<string, Element>();
    container.querySelectorAll('tr[data-key]').forEach((row) => {
      rowsBefore.set(row.getAttribute('data-key') || '', row);
    });
    const replaceBefore = getDomReplaceCount();

    rowsState!.set((rows) => {
      const next = rows.slice();
      const swapped = next[1];
      next[1] = next[3];
      next[3] = swapped;
      return next;
    });
    flushScheduler();

    const orderedKeys = Array.from(
      container.querySelectorAll('tr[data-key]')
    ).map((row) => row.getAttribute('data-key'));

    expect(orderedKeys).toEqual(['1', '4', '3', '2', '5']);
    container.querySelectorAll('tr[data-key]').forEach((row) => {
      const key = row.getAttribute('data-key') || '';
      expect(row).toBe(rowsBefore.get(key));
    });
    expect(getDomReplaceCount() - replaceBefore).toBe(0);
  });

  it('should preserve keyed table identity across JSX component boundaries', () => {
    type RowData = { id: number; label: string };

    let rowsState: ReturnType<typeof state<RowData[]>> | null = null;
    let selectedState: ReturnType<typeof state<number | null>> | null = null;

    function KeyedRow({
      item,
      isSelected,
    }: {
      item: RowData;
      isSelected: (id: number) => boolean;
    }) {
      return (
        <tr class={() => (isSelected(item.id) ? 'danger' : '')}>
          <td>{item.label}</td>
        </tr>
      );
    }

    function KeyedTable({
      rows,
      isSelected,
    }: {
      rows: ReturnType<typeof state<RowData[]>>;
      isSelected: (id: number) => boolean;
    }) {
      return (
        <table>
          <tbody>
            {
              <For each={() => rows()} by={(item) => item.id}>
                {(item) => <KeyedRow item={item} isSelected={isSelected} />}
              </For>
            }
          </tbody>
        </table>
      );
    }

    const Component = () => {
      rowsState = state([
        { id: 1, label: 'Row 1' },
        { id: 2, label: 'Row 2' },
        { id: 3, label: 'Row 3' },
      ]);
      selectedState = state<number | null>(null);
      const isSelected = selector(selectedState);

      return <KeyedTable rows={rowsState} isSelected={isSelected} />;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const row1Before = container.querySelector('[data-key="1"]');
    const row2Before = container.querySelector('[data-key="2"]');
    const row3Before = container.querySelector('[data-key="3"]');
    const replaceBefore = getDomReplaceCount();

    selectedState!.set(2);
    flushScheduler();

    expect(container.querySelector('[data-key="1"]')).toBe(row1Before);
    expect(container.querySelector('[data-key="2"]')).toBe(row2Before);
    expect(container.querySelector('[data-key="3"]')).toBe(row3Before);
    expect((row2Before as HTMLElement).className).toBe('danger');

    rowsState!.set((rows) =>
      rows.map((item) =>
        item.id === 1 ? { ...item, label: `${item.label} !!!` } : item
      )
    );
    flushScheduler();

    expect(container.querySelector('[data-key="1"]')).toBe(row1Before);
    expect(container.querySelector('[data-key="2"]')).toBe(row2Before);
    expect(container.querySelector('[data-key="3"]')).toBe(row3Before);
    expect(row1Before?.querySelector('td')?.textContent).toBe('Row 1 !!!');

    rowsState!.set((rows) => [rows[0], rows[2], rows[1]]);
    flushScheduler();

    const orderedKeys = Array.from(
      container.querySelectorAll('tr[data-key]')
    ).map((row) => row.getAttribute('data-key'));

    expect(orderedKeys).toEqual(['1', '3', '2']);
    expect(container.querySelector('[data-key="1"]')).toBe(row1Before);
    expect(container.querySelector('[data-key="2"]')).toBe(row2Before);
    expect(container.querySelector('[data-key="3"]')).toBe(row3Before);
    expect(getDomReplaceCount() - replaceBefore).toBe(0);
  });

  it(
    'should preserve keyed row identity through long interleaved move-only reorders',
    { timeout: 20000 },
    () => {
      const { container, cleanup } = createTestContainer();
      let rowsState: ReturnType<
        typeof state<Array<{ id: number; label: string }>>
      > | null = null;
      const frameworkClicks: number[] = [];
      const rowRenderCounts = new Map<number, number>();

      const Row = ({ item }: { item: { id: number; label: string } }) => {
        rowRenderCounts.set(item.id, (rowRenderCounts.get(item.id) ?? 0) + 1);
        const local = state(0);

        return (
          <button
            data-row={String(item.id)}
            onClick={() => {
              frameworkClicks.push(item.id);
              local.set((value) => value + 1);
            }}
          >
            {() => `${item.label}:${local()}`}
          </button>
        );
      };

      const initialRows = Array.from({ length: 200 }, (_, index) => ({
        id: index + 1,
        label: `Row ${index + 1}`,
      }));
      const interleavedRows = interleaveRows(initialRows);

      const Component = () => {
        rowsState = state(initialRows);

        return (
          <div>
            <For each={rowsState} by={(row) => row.id}>
              {(row) => <Row item={row} />}
            </For>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const replaceBefore = getDomReplaceCount();
      const idToCheck = 10;
      const beforeElem = container.querySelector(
        `[data-row="${idToCheck}"]`
      ) as HTMLButtonElement;
      let nativeClicks = 0;
      beforeElem.addEventListener('click', () => {
        nativeClicks++;
      });

      beforeElem.click();
      flushScheduler();

      expect(beforeElem.textContent).to.equal('Row 10:1');
      expect(nativeClicks).to.equal(1);
      expect(frameworkClicks).to.deep.equal([10]);
      expect(rowRenderCounts.get(idToCheck)).to.equal(1);

      rowsState!.set(interleavedRows);
      flushScheduler();

      const afterElem = container.querySelector(
        `[data-row="${idToCheck}"]`
      ) as HTMLButtonElement;
      expect(afterElem).to.equal(beforeElem);
      expect(afterElem.textContent).to.equal('Row 10:1');
      expect(rowRenderCounts.get(idToCheck)).to.equal(1);
      expect(getDomReplaceCount() - replaceBefore).toBe(0);

      afterElem.click();
      flushScheduler();

      expect(afterElem.textContent).to.equal('Row 10:2');
      expect(nativeClicks).to.equal(2);
      expect(frameworkClicks).to.deep.equal([10, 10]);

      const orderedKeys = Array.from(
        container.querySelectorAll('[data-row]')
      ).map((row) => row.getAttribute('data-row'));
      expect(orderedKeys).to.deep.equal(
        interleavedRows.map((row) => String(row.id))
      );

      cleanup();
    }
  );
});
