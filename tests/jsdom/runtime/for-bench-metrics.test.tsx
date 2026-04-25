import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createIsland, state } from '../../../src';
import { For } from '../../../src/control';
import { getBenchMetrics } from '../../../src/runtime/for';
import { createTestContainer, flushScheduler } from '../../../test-utils/render/test-renderer';

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

  it('should record truncate metrics for clearing the list', () => {
    let rowsState: ReturnType<
      typeof state<Array<{ id: number; label: string }>>
    > | null = null;

    const Component = () => {
      rowsState = state(
        Array.from({ length: 50 }, (_, index) => ({
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

    rowsState!.set([]);
    flushScheduler();

    const metrics = getBenchMetrics();
    expect(metrics.fastLaneName).toBe('TRUNCATE');
    expect(metrics.itemsRemoved).toBe(50);
    expect(metrics.rowFactoryInvocations).toBe(0);
    expect(metrics.itemsReused).toBe(0);
  });
});
