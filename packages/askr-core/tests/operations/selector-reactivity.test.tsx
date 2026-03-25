import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createIsland, selector, state } from '../../src/index';
import { For } from '../../src/for';
import { flushScheduler } from '../helpers/test-renderer';
import { createTestContainer } from '../helpers/test-renderer';

describe('selector reactivity', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should invalidate only the previous and next keyed candidates', () => {
    let selected!: ReturnType<typeof state<number | null>>;
    const classEvaluations = new Map<number, number>();

    const Row = ({ id }: { id: number }) => {
      const isSelected = selector(selected);
      return (
        <tr
          data-id={id}
          class={() => {
            classEvaluations.set(id, (classEvaluations.get(id) ?? 0) + 1);
            return isSelected(id) ? 'danger' : '';
          }}
        >
          <td>{id}</td>
        </tr>
      );
    };

    const App = () => {
      selected = state<number | null>(null);
      return (
        <table>
          <tbody>
            {For(
              () => [1, 2, 3, 4, 5],
              (item) => item,
              (item) => (
                <Row id={item} />
              )
            )}
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    classEvaluations.clear();
    selected.set(3);
    flushScheduler();

    expect(classEvaluations.get(3) ?? 0).toBe(1);
    expect(classEvaluations.get(1) ?? 0).toBe(0);
    expect(classEvaluations.get(2) ?? 0).toBe(0);
    expect(classEvaluations.get(4) ?? 0).toBe(0);
    expect(classEvaluations.get(5) ?? 0).toBe(0);

    classEvaluations.clear();
    selected.set(5);
    flushScheduler();

    expect(classEvaluations.get(3) ?? 0).toBe(1);
    expect(classEvaluations.get(5) ?? 0).toBe(1);
    expect(classEvaluations.get(1) ?? 0).toBe(0);
    expect(classEvaluations.get(2) ?? 0).toBe(0);
    expect(classEvaluations.get(4) ?? 0).toBe(0);
  });

  it('should fall back to broad invalidation when a custom comparator is used', () => {
    let selected!: ReturnType<typeof state<{ id: number } | null>>;
    const evaluations = new Map<number, number>();

    const Row = ({ id }: { id: number }) => {
      const isSelected = selector(selected, (a, b) => a?.id === b?.id);

      return (
        <tr
          class={() => {
            evaluations.set(id, (evaluations.get(id) ?? 0) + 1);
            return isSelected({ id }) ? 'danger' : '';
          }}
        >
          <td>{id}</td>
        </tr>
      );
    };

    const App = () => {
      selected = state<{ id: number } | null>(null);
      return (
        <table>
          <tbody>
            {For(
              () => [1, 2, 3],
              (item) => item,
              (item) => (
                <Row id={item} />
              )
            )}
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    evaluations.clear();
    selected.set({ id: 2 });
    flushScheduler();

    expect(evaluations.get(1) ?? 0).toBe(1);
    expect(evaluations.get(2) ?? 0).toBe(1);
    expect(evaluations.get(3) ?? 0).toBe(1);
  });

  it('should clean up selector subscriptions when rows are removed', () => {
    let selected!: ReturnType<typeof state<number | null>>;
    let rows!: ReturnType<typeof state<number[]>>;

    const Row = ({ id }: { id: number }) => {
      const isSelected = selector(selected);
      return <div class={() => (isSelected(id) ? 'danger' : '')}>{id}</div>;
    };

    const App = () => {
      selected = state<number | null>(null);
      rows = state([1, 2, 3]);

      return (
        <section>
          {For(
            rows,
            (item) => item,
            (item) => (
              <Row id={item} />
            )
          )}
        </section>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(selected._derivedSubscribers?.size ?? 0).toBe(3);

    rows.set([1, 2]);
    flushScheduler();

    expect(selected._derivedSubscribers?.size ?? 0).toBe(2);
  });

  it('should enforce stable hook order for selector()', () => {
    let enabled!: ReturnType<typeof state<boolean>>;

    const App = () => {
      enabled = state(false);
      const current = state<number | null>(null);
      if (enabled()) {
        const isSelected = selector(current);
        isSelected(1);
      }
      return <div>{String(current())}</div>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(() => {
      enabled.set(true);
      flushScheduler();
    }).toThrow(/hook order|selector|conditionally/i);
  });
});
