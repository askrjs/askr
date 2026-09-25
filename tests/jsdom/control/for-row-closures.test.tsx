import { describe, it, expect } from 'vite-plus/test';
import { derive, state } from '../../../src/index';
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
