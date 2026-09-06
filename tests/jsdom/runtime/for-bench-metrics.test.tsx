import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '@askrjs/askr/boot';
import { For } from '../../../src/control';
import { getBenchMetrics } from '../../../src/runtime/control/for';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type BenchGlobal = typeof globalThis & {
  __ASKR_BENCH__?: boolean;
};

describe('for bench metrics', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;
    (globalThis as BenchGlobal).__ASKR_BENCH__ = true;
  });

  afterEach(() => {
    delete (globalThis as BenchGlobal).__ASKR_BENCH__;
    cleanup();
  });

  it('should record focused metrics for same-order partial updates', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const Component = () => {
      rowsState = state(
        Array.from({ length: 1000 }, (_, index) => ({
          id: index + 1,
          label: `Row ${index + 1}`,
        }))
      );

      return (
        <table>
          <tbody>
            {
              <For each={() => rowsState!()} by={(row) => row.id}>
                {(row) => (
                  <tr>
                    <td>{row.label}</td>
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

    rowsState!.set((rows) =>
      rows.map((row, index) =>
        index % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row
      )
    );
    flushScheduler();

    const metrics = getBenchMetrics();
    expect(metrics.fastLaneName).toBe('NO_REORDER');
    expect(metrics.itemsCreated).toBe(0);
    expect(metrics.itemsRemoved).toBe(0);
    expect(metrics.itemsMoved).toBe(0);
    expect(metrics.rowFactoryInvocations).toBe(100);
    expect(metrics.domMoves).toBe(0);
  });

  it('should record append metrics when growing the list in place', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const Component = () => {
      rowsState = state(
        Array.from({ length: 10 }, (_, index) => ({
          id: index + 1,
          label: `Row ${index + 1}`,
        }))
      );

      return (
        <table>
          <tbody>
            {
              <For each={() => rowsState!()} by={(row) => row.id}>
                {(row) => (
                  <tr>
                    <td>{row.label}</td>
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

    rowsState!.set((rows) =>
      rows.concat(
        Array.from({ length: 5 }, (_, index) => ({
          id: rows.length + index + 1,
          label: `Row ${rows.length + index + 1}`,
        }))
      )
    );
    flushScheduler();

    const metrics = getBenchMetrics();
    expect(metrics.fastLaneName).toBe('APPEND');
    expect(metrics.itemsCreated).toBe(5);
    expect(metrics.itemsReused).toBe(10);
    expect(metrics.rowFactoryInvocations).toBe(5);
    expect(metrics.domMoves).toBe(0);
  });

  it('should retain existing DOM and use INSERT_ONE for a middle insertion', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const first = { id: 1, label: 'One' };
    const third = { id: 3, label: 'Three' };

    const Component = () => {
      rowsState = state([first, third]);
      return (
        <div>
          <For each={() => rowsState!()} by={(row) => row.id}>
            {(row) => <button data-row={row.id}>{row.label}</button>}
          </For>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const retained = container.querySelector('[data-row="3"]');

    rowsState!.set([first, { id: 2, label: 'Two' }, third]);
    flushScheduler();

    const metrics = getBenchMetrics();
    expect(metrics.fastLaneName).toBe('INSERT_ONE');
    expect(container.querySelector('[data-row="3"]')).toBe(retained);
    expect(container.textContent).toBe('OneTwoThree');
  });

  it('should record removal and move metrics for middle-row deletion', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const Component = () => {
      rowsState = state(
        Array.from({ length: 100 }, (_, index) => ({
          id: index + 1,
          label: `Row ${index + 1}`,
        }))
      );

      return (
        <table>
          <tbody>
            {
              <For each={() => rowsState!()} by={(row) => row.id}>
                {(row) => (
                  <tr>
                    <td>{row.label}</td>
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

    rowsState!.set((rows) => rows.filter((row) => row.id !== 50));
    flushScheduler();

    const metrics = getBenchMetrics();
    expect(metrics.fastLaneName).toBe('REMOVE_ONE');
    expect(metrics.itemsRemoved).toBe(1);
    expect(metrics.rowFactoryInvocations).toBe(0);
    expect(metrics.itemsReused).toBe(99);
  });

  it('should skip retained DOM synchronization for unchanged truncation', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const rows = Array.from({ length: 2_000 }, (_, index) => ({
      id: index + 1,
      label: `Row ${index + 1}`,
    }));

    const Component = () => {
      rowsState = state(rows);

      return (
        <table>
          <tbody>
            {
              <For each={() => rowsState!()} by={(row) => row.id}>
                {(row) => (
                  <tr>
                    <td>{row.label}</td>
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

    rowsState!.set(rows.slice(0, 1_000));
    flushScheduler();

    const metrics = getBenchMetrics();
    expect(metrics.fastLaneName).toBe('TRUNCATE');
    expect(metrics.itemsRemoved).toBe(1_000);
    expect(metrics.rowFactoryInvocations).toBe(0);
    expect(metrics.itemsReused).toBe(1_000);
    expect(metrics.itemsCreated).toBe(0);
    expect(metrics.itemsMoved).toBe(0);
    expect(metrics.itemDomSyncCalls).toBe(0);
  });

  it('should synchronize only a changed retained row during truncation', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const rows = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      label: `Row ${index + 1}`,
    }));

    const Component = () => {
      rowsState = state(rows);

      return (
        <table>
          <tbody>
            <For each={() => rowsState!()} by={(row) => row.id}>
              {(row) => (
                <tr>
                  <td>{row.label}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    rowsState!.set([
      ...rows.slice(0, 4),
      { ...rows[4]!, label: 'Row 5 updated' },
      ...rows.slice(5, 10),
    ]);
    flushScheduler();

    const metrics = getBenchMetrics();
    expect(metrics.fastLaneName).toBe('TRUNCATE');
    expect(metrics.itemsRemoved).toBe(10);
    expect(metrics.rowFactoryInvocations).toBe(1);
    expect(metrics.itemDomSyncCalls).toBe(1);
    expect(container.querySelector('[data-key="5"]')?.textContent).toBe(
      'Row 5 updated'
    );
  });

  it('should record a two-move swap without row recreation', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const Component = () => {
      rowsState = state(
        Array.from({ length: 1000 }, (_, index) => ({
          id: index + 1,
          label: `Row ${index + 1}`,
        }))
      );

      return (
        <table>
          <tbody>
            {
              <For each={() => rowsState!()} by={(row) => row.id}>
                {(row) => (
                  <tr>
                    <td>{row.label}</td>
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

    rowsState!.set((rows) => {
      const next = rows.slice();
      const swapped = next[1];
      next[1] = next[998];
      next[998] = swapped;
      return next;
    });
    flushScheduler();

    const metrics = getBenchMetrics();
    expect(metrics.fastLaneName).toBe('SWAP');
    expect(metrics.itemsMoved).toBe(2);
    expect(metrics.itemsCreated).toBe(0);
    expect(metrics.itemsRemoved).toBe(0);
    expect(metrics.rowFactoryInvocations).toBe(0);
    expect(metrics.domMoves).toBe(2);
    expect(metrics.replaceChildrenCommits).toBe(0);
  });

  it('should bulk commit dense move-only reorders without row recreation', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const Component = () => {
      rowsState = state(
        Array.from({ length: 100 }, (_, index) => ({
          id: index + 1,
          label: `Row ${index + 1}`,
        }))
      );

      return (
        <table>
          <tbody>
            {
              <For each={() => rowsState!()} by={(row) => row.id}>
                {(row) => (
                  <tr>
                    <td>{row.label}</td>
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

    const firstRow = container.querySelector('tr[data-key="1"]');
    const lastRow = container.querySelector('tr[data-key="100"]');

    rowsState!.set((rows) => rows.slice().reverse());
    flushScheduler();

    const orderedKeys = Array.from(container.querySelectorAll('tr')).map(
      (row) => row.getAttribute('data-key')
    );
    const metrics = getBenchMetrics();

    expect(orderedKeys[0]).toBe('100');
    expect(orderedKeys[99]).toBe('1');
    expect(container.querySelectorAll('tr')[0]).toBe(lastRow);
    expect(container.querySelectorAll('tr')[99]).toBe(firstRow);
    expect(metrics.fastLaneName).toBe('FULL_KEYED');
    expect(metrics.itemsCreated).toBe(0);
    expect(metrics.itemsRemoved).toBe(0);
    expect(metrics.rowFactoryInvocations).toBe(0);
    expect(metrics.replaceChildrenCommits).toBe(1);
  });
});
