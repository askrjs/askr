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
            {
              <For each={() => [1, 2, 3, 4, 5]} by={(item) => item}>
                {(item) => <Row id={item} />}
              </For>
            }
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
            {
              <For each={() => [1, 2, 3]} by={(item) => item}>
                {(item) => <Row id={item} />}
              </For>
            }
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
          {
            <For each={rows} by={(item) => item}>
              {(item) => <Row id={item} />}
            </For>
          }
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

  it('should update class when selector is created in parent and passed as prop', () => {
    let selected!: ReturnType<typeof state<number | null>>;

    const Row = ({
      id,
      isSelected,
    }: {
      id: number;
      isSelected: (id: number) => boolean;
    }) => {
      return (
        <tr data-id={String(id)} class={() => (isSelected(id) ? 'danger' : '')}>
          <td>{id}</td>
        </tr>
      );
    };

    const App = () => {
      selected = state<number | null>(null);
      const isSelected = selector(selected);

      return (
        <table>
          <tbody>
            {
              <For each={() => [1, 2, 3, 4, 5]} by={(item) => item}>
                {(item) => <Row id={item} isSelected={isSelected} />}
              </For>
            }
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    // Initially no row is selected
    const rows = () => container.querySelectorAll('tr');
    for (let i = 0; i < 5; i++) {
      expect(rows()[i].className).toBe('');
    }

    // Select row 5
    selected.set(5);
    flushScheduler();

    expect(rows()[4].className).toBe('danger');
    for (let i = 0; i < 4; i++) {
      expect(rows()[i].className).toBe('');
    }

    // Move selection to row 2
    selected.set(2);
    flushScheduler();

    expect(rows()[1].className).toBe('danger');
    expect(rows()[4].className).toBe('');
    for (const i of [0, 2, 3]) {
      expect(rows()[i].className).toBe('');
    }
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
