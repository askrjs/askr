import { describe, it, expect } from 'vite-plus/test';
import { derive, state } from '../../../src/index';
import { defineScope, readScope } from '../../../src/runtime/context/context';
import { For } from '@askrjs/askr/control';
import type { JSXElement } from '../../../src/jsx/types';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

type Item = { id: string };

const ITEMS: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function activeRows(container: HTMLElement): Array<string | null> {
  return Array.from(container.querySelectorAll('[data-active="true"]')).map(
    (node) => node.textContent
  );
}

describe('For row closures', () => {
  it('should rerender existing rows with the latest parent-captured constant without remounting them', () => {
    const { container, cleanup } = createTestContainer();
    let select: (id: string) => void = () => {};
    const rowMounts: string[] = [];
    let rowRenders = 0;

    const Row = ({ item, current }: { item: Item; current: string }) => {
      const [mountedAt] = state(() => {
        rowMounts.push(item.id);
        return current;
      });
      return (
        <li
          data-active={item.id === current ? 'true' : 'false'}
          data-mounted-at={mountedAt()}
        >
          {item.id}
        </li>
      );
    };

    const App = () => {
      const [selected, setSelected] = state('a');
      select = setSelected;
      const current = selected();
      return (
        <ul>
          <For each={ITEMS} by={(item) => item.id}>
            {(item) => {
              rowRenders++;
              return (<Row item={item} current={current} />) as JSXElement;
            }}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    const rowsBefore = Array.from(container.querySelectorAll('li'));
    expect(activeRows(container)).toEqual(['a']);
    const rendersBefore = rowRenders;

    select('c');
    flushScheduler();

    expect(activeRows(container)).toEqual(['c']);
    expect(rowRenders - rendersBefore).toBe(ITEMS.length);
    expect(Array.from(container.querySelectorAll('li'))).toEqual(rowsBefore);
    expect(rowMounts).toEqual(['a', 'b', 'c']);
    expect(
      rowsBefore.map((row) => row.getAttribute('data-mounted-at'))
    ).toEqual(['a', 'a', 'a']);
    cleanup();
  });

  it('should apply the latest closure together with a source change in the same parent render', () => {
    const { container, cleanup } = createTestContainer();
    let update: () => void = () => {};

    const App = () => {
      const [items, setItems] = state<Item[]>(ITEMS);
      const [selected, setSelected] = state('a');
      update = () => {
        setItems([{ id: 'c' }, { id: 'b' }, { id: 'd' }]);
        setSelected('b');
      };
      const current = selected();
      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item) => (
              <li data-active={item.id === current ? 'true' : 'false'}>
                {item.id}
              </li>
            )}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    const rowB = container.querySelectorAll('li')[1];

    update();
    flushScheduler();

    expect(
      Array.from(container.querySelectorAll('li')).map((li) => li.textContent)
    ).toEqual(['c', 'b', 'd']);
    expect(activeRows(container)).toEqual(['b']);
    expect(container.querySelectorAll('li')[1]).toBe(rowB);
    cleanup();
  });

  it('should not rerun rows when the parent rerenders with the same row callback', () => {
    const { container, cleanup } = createTestContainer();
    let bump: () => void = () => {};
    let rowRenders = 0;
    const renderRow = (item: Item) => {
      rowRenders++;
      return <li>{item.id}</li>;
    };

    const App = () => {
      const [count, setCount] = state(0);
      bump = () => setCount(count() + 1);
      return (
        <div data-count={String(count())}>
          <For each={ITEMS} by={(item) => item.id}>
            {renderRow}
          </For>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    const rendersBefore = rowRenders;

    bump();
    flushScheduler();

    expect(container.querySelector('div')?.getAttribute('data-count')).toBe(
      '1'
    );
    expect(rowRenders).toBe(rendersBefore);
    cleanup();
  });

  it('should subscribe each row that reads a parent getter in its callback', () => {
    const { container, cleanup } = createTestContainer();
    let select: (id: string) => void = () => {};
    let parentRenders = 0;
    let rowRenders = 0;

    const App = () => {
      parentRenders++;
      const [selected, setSelected] = state('a');
      select = setSelected;
      return (
        <ul>
          <For each={ITEMS} by={(item) => item.id}>
            {(item) => {
              rowRenders++;
              return (
                <li data-active={item.id === selected() ? 'true' : 'false'}>
                  {item.id}
                </li>
              );
            }}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    const rowsBefore = Array.from(container.querySelectorAll('li'));
    const parentBefore = parentRenders;
    const rowsRendered = rowRenders;

    select('c');
    flushScheduler();

    expect(activeRows(container)).toEqual(['c']);
    // The read belongs to the row scopes, not the parent: every row that read
    // the getter reruns, and the parent does not.
    expect(parentRenders).toBe(parentBefore);
    expect(rowRenders - rowsRendered).toBe(ITEMS.length);
    expect(Array.from(container.querySelectorAll('li'))).toEqual(rowsBefore);
    cleanup();
  });

  it('should keep row component state when a self-subscribed row also rerenders with its parent', () => {
    const { container, cleanup } = createTestContainer();
    let setNotes: Record<string, (value: string) => void> = {};
    let toggle: () => void = () => {};

    type Order = { id: string; total: number };
    const ORDERS: Order[] = [
      { id: 'a', total: 3 },
      { id: 'b', total: 1 },
      { id: 'c', total: 2 },
    ];

    const Row = ({ order, selected }: { order: Order; selected: boolean }) => {
      const [note, setNote] = state(`note ${order.id}`);
      setNotes[order.id] = setNote;
      return (
        <li data-selected={String(selected)}>
          {order.id}:{note()}
        </li>
      );
    };

    const App = () => {
      const [ascending, setAscending] = state(true);
      toggle = () => setAscending(!ascending());
      // The parent only reads the derive; the rows read the state directly.
      const visible = derive(() =>
        ORDERS.slice().sort((left, right) =>
          ascending() ? left.total - right.total : right.total - left.total
        )
      );
      return (
        <ul>
          <For each={visible()} by={(order) => order.id}>
            {(order) =>
              (<Row order={order} selected={ascending()} />) as JSXElement
            }
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    setNotes.a('edited');
    flushScheduler();
    expect(
      Array.from(container.querySelectorAll('li')).map((li) => li.textContent)
    ).toEqual(['b:note b', 'c:note c', 'a:edited']);

    toggle();
    flushScheduler();

    expect(
      Array.from(container.querySelectorAll('li')).map((li) => li.textContent)
    ).toEqual(['a:edited', 'c:note c', 'b:note b']);
    expect(
      Array.from(container.querySelectorAll('li')).map((li) =>
        li.getAttribute('data-selected')
      )
    ).toEqual(['false', 'false', 'false']);
    cleanup();
  });

  it('should keep row component state when a self-subscribed row gets a new item in the same flush', () => {
    const { container, cleanup } = createTestContainer();
    let setNote: (value: string) => void = () => {};
    let toggle: () => void = () => {};

    const Row = ({ label, active }: { label: string; active: boolean }) => {
      const [note, set] = state('initial');
      setNote = set;
      return (
        <li data-active={String(active)}>
          {label}:{note()}
        </li>
      );
    };
    const renderRow = (item: { id: string; label: string }) =>
      (<Row label={item.label} active={flag()} />) as JSXElement;
    let flag: () => boolean = () => false;

    const App = () => {
      const [on, setOn] = state(false);
      flag = on;
      toggle = () => setOn(!on());
      const items = derive(() => [{ id: 'a', label: on() ? 'on' : 'off' }]);
      return (
        <ul>
          <For each={items()} by={(item) => item.id}>
            {renderRow}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    setNote('edited');
    flushScheduler();
    expect(container.textContent).toBe('off:edited');

    toggle();
    flushScheduler();

    expect(container.textContent).toBe('on:edited');
    expect(container.querySelector('li')?.getAttribute('data-active')).toBe(
      'true'
    );
    cleanup();
  });
});

describe('For row runs per flush', () => {
  type Labeled = { id: string; label: string; note?: string };

  function texts(container: HTMLElement): Array<string | null> {
    return Array.from(container.querySelectorAll('li')).map(
      (li) => li.textContent
    );
  }

  it('should run a proxied row once when its item and the row callback change in the same parent render', () => {
    const { container, cleanup } = createTestContainer();
    let update: () => void = () => {};
    const runs: string[] = [];

    const App = () => {
      const [items, setItems] = state<Labeled[]>([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]);
      const [selected, setSelected] = state('a');
      update = () => {
        setItems([
          { id: 'a', label: 'A2' },
          { id: 'b', label: 'B' },
        ]);
        setSelected('b');
      };
      const current = selected();
      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item) => {
              runs.push(item.id);
              return (
                <li data-active={item.id === current ? 'true' : 'false'}>
                  {item.label}
                </li>
              );
            }}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    const rowsBefore = Array.from(container.querySelectorAll('li'));
    runs.length = 0;

    update();
    flushScheduler();

    expect(texts(container)).toEqual(['A2', 'B']);
    expect(activeRows(container)).toEqual(['B']);
    expect(Array.from(container.querySelectorAll('li'))).toEqual(rowsBefore);
    expect(runs.slice().sort()).toEqual(['a', 'b']);
    cleanup();
  });

  it('should apply the latest row callback when a proxied item changes only in a field the row does not read', () => {
    const { container, cleanup } = createTestContainer();
    let update: () => void = () => {};
    const runs: string[] = [];

    const App = () => {
      const [items, setItems] = state<Labeled[]>([
        { id: 'a', label: 'A', note: 'x' },
        { id: 'b', label: 'B', note: 'x' },
      ]);
      const [selected, setSelected] = state('a');
      update = () => {
        setItems([
          { id: 'a', label: 'A', note: 'y' },
          { id: 'b', label: 'B', note: 'x' },
        ]);
        setSelected('a2');
      };
      const current = selected();
      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item) => {
              runs.push(item.id);
              return <li data-current={current}>{item.label}</li>;
            }}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    runs.length = 0;

    update();
    flushScheduler();

    expect(texts(container)).toEqual(['A', 'B']);
    expect(
      Array.from(container.querySelectorAll('li')).map((li) =>
        li.getAttribute('data-current')
      )
    ).toEqual(['a2', 'a2']);
    expect(runs.slice().sort()).toEqual(['a', 'b']);
    cleanup();
  });

  it('should run an index-reading row once when it moves and the row callback changes in the same parent render', () => {
    const { container, cleanup } = createTestContainer();
    let update: () => void = () => {};
    const runs: string[] = [];
    const a: Labeled = { id: 'a', label: 'A' };
    const b: Labeled = { id: 'b', label: 'B' };
    const c: Labeled = { id: 'c', label: 'C' };

    const App = () => {
      const [items, setItems] = state<Labeled[]>([a, b, c]);
      const [selected, setSelected] = state('a');
      update = () => {
        setItems([c, b, a]);
        setSelected('c');
      };
      const current = selected();
      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item, index) => {
              runs.push(item.id);
              return (
                <li data-active={item.id === current ? 'true' : 'false'}>
                  {item.label}:{index()}
                </li>
              );
            }}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    runs.length = 0;

    update();
    flushScheduler();

    expect(texts(container)).toEqual(['C:0', 'B:1', 'A:2']);
    expect(activeRows(container)).toEqual(['C:0']);
    expect(runs.slice().sort()).toEqual(['a', 'b', 'c']);
    cleanup();
  });

  it('should rerender a moved plain row with its latest item, not the item it was created with', () => {
    const { container, cleanup } = createTestContainer();
    let setItems: (items: Array<[string, string]>) => void = () => {};
    const renderRow = (item: [string, string], index: () => number) => (
      <li>
        {item[1]}:{index()}
      </li>
    );

    const App = () => {
      const [items, set] = state<Array<[string, string]>>([
        ['a', 'A'],
        ['b', 'B'],
      ]);
      setItems = set;
      return (
        <ul>
          <For each={items} by={(item) => item[0]}>
            {renderRow}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    const edited: [string, string] = ['a', 'A2'];
    const b: [string, string] = ['b', 'B'];
    setItems([edited, b]);
    flushScheduler();
    expect(texts(container)).toEqual(['A2:0', 'B:1']);

    setItems([b, edited]);
    flushScheduler();

    expect(texts(container)).toEqual(['B:0', 'A2:1']);
    cleanup();
  });

  it('should rerender a plain row with its latest item when the context frame changes', () => {
    const { container, cleanup } = createTestContainer();
    const ThemeScope = defineScope('light');
    let setItems: (items: Array<[string, string]>) => void = () => {};
    let setTheme: (value: string) => void = () => {};

    const Reader = ({ label }: { label: string }) => (
      <li>
        {label}:{readScope(ThemeScope)}
      </li>
    );
    const renderRow = (item: [string, string]) =>
      (<Reader label={item[1]} />) as JSXElement;

    const App = () => {
      const [items, set] = state<Array<[string, string]>>([['a', 'A']]);
      const [theme, setThemeState] = state('dark');
      setItems = set;
      setTheme = setThemeState;
      return (
        <ThemeScope value={theme()}>
          <ul>
            <For each={items} by={(item) => item[0]}>
              {renderRow}
            </For>
          </ul>
        </ThemeScope>
      );
    };

    createIsland({ root: container, component: App });
    setItems([['a', 'A2']]);
    flushScheduler();
    expect(texts(container)).toEqual(['A2:dark']);

    setTheme('contrast');
    flushScheduler();

    expect(texts(container)).toEqual(['A2:contrast']);
    cleanup();
  });

  it('should run a proxied row once when its item and the context frame change in the same parent render', () => {
    const { container, cleanup } = createTestContainer();
    const ThemeScope = defineScope('light');
    let update: () => void = () => {};
    const runs: string[] = [];

    const Reader = ({ children }: { children?: unknown }) => (
      <li>
        {children as string}:{readScope(ThemeScope)}
      </li>
    );
    const renderRow = (item: Labeled) => {
      runs.push(item.id);
      return (<Reader>{item.label}</Reader>) as JSXElement;
    };

    const App = () => {
      const [items, setItems] = state<Labeled[]>([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]);
      const [theme, setTheme] = state('dark');
      update = () => {
        setItems([
          { id: 'a', label: 'A2' },
          { id: 'b', label: 'B' },
        ]);
        setTheme('contrast');
      };
      return (
        <ThemeScope value={theme()}>
          <ul>
            <For each={items} by={(item) => item.id}>
              {renderRow}
            </For>
          </ul>
        </ThemeScope>
      );
    };

    createIsland({ root: container, component: App });
    runs.length = 0;

    update();
    flushScheduler();

    expect(texts(container)).toEqual(['A2:contrast', 'B:contrast']);
    expect(runs.slice().sort()).toEqual(['a', 'b']);
    cleanup();
  });

  // Each step names keys in order; a trailing `'` gives that key a new item.
  // The comments name the reconcile path each move takes.
  const MOVES = [
    // Two rows exchanged, the middle row untouched: SWAP.
    { name: 'swap', from: 'a b c', to: "c' b a'", runs: ['a', 'c'] },
    // Every row moves, one with a new item: FULL_KEYED.
    { name: 'rotation', from: 'a b c', to: "b c a'", runs: ['a', 'b', 'c'] },
    // The head removed, the shifted suffix reindexed: REMOVE_ONE.
    { name: 'remove one', from: 'a b c', to: "b' c", runs: ['b', 'c'] },
    // A new head row: INSERT_ONE declines a changed item, so FULL_KEYED.
    { name: 'insert one', from: 'a b', to: "d a' b", runs: ['a', 'b', 'd'] },
  ] as const;

  describe.each(['proxied', 'plain'] as const)('with %s items', (kind) => {
    type Entry = Labeled | [string, string];
    const idOf = (entry: Entry) => (Array.isArray(entry) ? entry[0] : entry.id);
    const labelOf = (entry: Entry) =>
      Array.isArray(entry) ? entry[1] : entry.label;
    const make = (id: string, label: string): Entry =>
      kind === 'proxied' ? { id, label } : [id, label];

    it.each(MOVES)(
      'should run a row once when its item and read index change in one pass ($name)',
      ({ from, to, runs: expectedRuns }) => {
        const { container, cleanup } = createTestContainer();
        const entries = new Map<string, Entry>();
        const resolve = (step: string) =>
          step.split(' ').map((token) => {
            const id = token[0];
            const current = entries.get(id);
            if (current && !token.endsWith("'")) return current;
            const next = make(id, current ? `${id}2` : id);
            entries.set(id, next);
            return next;
          });
        let setItems: (items: Entry[]) => void = () => {};
        const runs: string[] = [];
        const renderRow = (entry: Entry, index: () => number) => {
          runs.push(idOf(entry));
          return (
            <li>
              {labelOf(entry)}:{index()}
            </li>
          );
        };

        const App = () => {
          const [items, set] = state<Entry[]>(resolve(from));
          setItems = set;
          return (
            <ul>
              <For each={items} by={idOf}>
                {renderRow}
              </For>
            </ul>
          );
        };

        createIsland({ root: container, component: App });
        runs.length = 0;

        const next = resolve(to);
        setItems(next);
        flushScheduler();

        expect(texts(container)).toEqual(
          next.map((entry, index) => `${labelOf(entry)}:${index}`)
        );
        expect(runs.slice().sort()).toEqual(expectedRuns);
        cleanup();
      }
    );
  });
});
