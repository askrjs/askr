import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { selector, state } from '../../../src/index';
import { createIsland } from '@askrjs/askr/boot';
import { For } from '../../../src/control';
import { flushScheduler } from '../../../test-utils/render/test-renderer';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { allowFrameworkWarnings } from '../../setup-env';

describe('selector reactivity', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should retain candidate subscriptions given an owner rerender when a selector source closure changes', () => {
    let tick!: ReturnType<typeof state<number>>;
    let selected!: ReturnType<typeof state<string>>;
    const App = () => {
      tick = state(0);
      selected = state('a');
      const isActive = selector(() => selected());
      return (
        <ul data-tick={tick()}>
          {['a', 'b', 'c'].map((item) => (
            <li
              key={item}
              data-id={item}
              data-active={isActive(item) ? 'true' : 'false'}
            />
          ))}
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    tick.set(1);
    flushScheduler();
    selected.set('c');
    flushScheduler();

    expect(
      container.querySelector<HTMLElement>('[data-id="a"]')?.dataset.active
    ).toBe('false');
    expect(
      container.querySelector<HTMLElement>('[data-id="c"]')?.dataset.active
    ).toBe('true');
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

  it('should update stable keyed readers when only the selector comparator changes', () => {
    type Item = { id: number };
    let selected!: ReturnType<typeof state<Item | null>>;
    let useIdEquality!: ReturnType<typeof state<boolean>>;
    const readSelected = () => selected();
    const byId = (left: Item | null, right: Item | null) =>
      left?.id === right?.id;

    const Row = ({ isSelected }: { isSelected: (item: Item) => boolean }) => (
      <div
        id="row"
        class={() => (isSelected({ id: 1 }) ? 'selected' : 'unselected')}
      />
    );

    const App = () => {
      selected = state<Item | null>({ id: 1 });
      useIdEquality = state(false);
      const isSelected = selector(
        readSelected,
        useIdEquality() ? byId : Object.is
      );
      return <Row key="stable" isSelected={isSelected} />;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.querySelector('#row')?.className).toBe('unselected');

    useIdEquality.set(true);
    flushScheduler();
    expect(container.querySelector('#row')?.className).toBe('selected');

    useIdEquality.set(false);
    flushScheduler();
    expect(container.querySelector('#row')?.className).toBe('unselected');
  });

  it('should not rerun the selector owner when its inline comparator changes', () => {
    type Item = { id: number };
    let selected!: ReturnType<typeof state<Item | null>>;
    let useIdEquality!: ReturnType<typeof state<boolean>>;
    let renders = 0;
    const readSelected = () => selected();

    const App = () => {
      renders += 1;
      selected = state<Item | null>({ id: 1 });
      useIdEquality = state(false);
      const isSelected = selector(
        readSelected,
        useIdEquality() ? (left, right) => left?.id === right?.id : Object.is
      );
      return <div id="owner">{isSelected({ id: 1 }) ? 'yes' : 'no'}</div>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.querySelector('#owner')?.textContent).toBe('no');
    expect(renders).toBe(1);

    useIdEquality.set(true);
    flushScheduler();

    expect(container.querySelector('#owner')?.textContent).toBe('yes');
    expect(renders).toBe(2);
  });

  it('should re-evaluate only the affected row when row-local selectors share a source', () => {
    let selected!: ReturnType<typeof state<number | null>>;
    let rows!: ReturnType<typeof state<number[]>>;
    const classEvaluations = new Map<number, number>();
    const readSelected = () => selected();

    const Row = ({ id }: { id: number }) => {
      const isSelected = selector(readSelected);
      return (
        <div
          data-id={id}
          class={() => {
            classEvaluations.set(id, (classEvaluations.get(id) ?? 0) + 1);
            return isSelected(id) ? 'danger' : '';
          }}
        >
          {id}
        </div>
      );
    };

    const App = () => {
      selected = state<number | null>(null);
      rows = state([1, 2, 3, 4, 5]);

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

    classEvaluations.clear();
    selected.set(3);
    flushScheduler();

    expect(classEvaluations.get(3) ?? 0).toBe(1);
    expect(classEvaluations.get(1) ?? 0).toBe(0);
    expect(classEvaluations.get(2) ?? 0).toBe(0);
    expect(classEvaluations.get(4) ?? 0).toBe(0);
    expect(classEvaluations.get(5) ?? 0).toBe(0);
  });

  it('should detach the previous selector source when the hook rebinds to a new source', () => {
    allowFrameworkWarnings(
      /Unused state variable detected in App at index [12]/
    );
    let useLeft!: ReturnType<typeof state<boolean>>;
    let leftSelected!: ReturnType<typeof state<number | null>>;
    let rightSelected!: ReturnType<typeof state<number | null>>;
    let evaluations = 0;

    const App = () => {
      useLeft = state(true);
      leftSelected = state<number | null>(1);
      rightSelected = state<number | null>(2);

      const isSelected = selector(useLeft() ? leftSelected : rightSelected);

      return (
        <div
          id="subject"
          class={() => {
            evaluations += 1;
            return isSelected(1) ? 'danger' : '';
          }}
        >
          {'row'}
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#subject')?.className).toBe('danger');

    evaluations = 0;
    useLeft.set(false);
    flushScheduler();

    expect(container.querySelector('#subject')?.className).toBe('');
    expect(evaluations).toBe(1);

    evaluations = 0;
    leftSelected.set(3);
    flushScheduler();

    expect(container.querySelector('#subject')?.className).toBe('');
    expect(evaluations).toBe(0);

    evaluations = 0;
    rightSelected.set(1);
    flushScheduler();

    expect(container.querySelector('#subject')?.className).toBe('danger');
    expect(evaluations).toBe(1);
  });

  it('should stop reading a shared selector source once its rows are removed', () => {
    let selected!: ReturnType<typeof state<number | null>>;
    let rows!: ReturnType<typeof state<number[]>>;
    let sourceReads = 0;
    const readSelected = () => {
      sourceReads += 1;
      return selected();
    };

    const Row = ({ id }: { id: number }) => {
      const isSelected = selector(readSelected);
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

    rows.set([1, 2]);
    flushScheduler();
    sourceReads = 0;
    selected.set(1);
    flushScheduler();
    expect(sourceReads).toBe(2);
    expect(container.querySelector('.danger')?.textContent).toBe('1');

    rows.set([]);
    flushScheduler();
    sourceReads = 0;
    selected.set(2);
    flushScheduler();
    expect(sourceReads).toBe(0);
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
