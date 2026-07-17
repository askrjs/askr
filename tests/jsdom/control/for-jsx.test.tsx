import { describe, it, expect } from 'vite-plus/test';
import { state } from '../../../src/index';
import { resource } from '../../../src/resources';
import { getCurrentComponentInstance } from '../../../src/runtime/component';
import { For, Show } from '@askrjs/askr/control';
import type { JSXElement } from '../../../src/jsx/types';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('For JSX primitive', () => {
  it('should register one parent ownership boundary for all keyed rows', () => {
    const { container, cleanup } = createTestContainer();
    let appInstance: ReturnType<typeof getCurrentComponentInstance> = null;

    const App = () => {
      appInstance = getCurrentComponentInstance();
      return (
        <For each={Array.from({ length: 1000 }, (_, id) => id)} by={(id) => id}>
          {(id) => <span>{id}</span>}
        </For>
      );
    };

    createIsland({ root: container, component: App });
    expect(appInstance?._ownedChildScopes?.size).toBe(1);
    cleanup();
  });

  it('should update index accessors after keyed reorder', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    let setItems: (next: Item[]) => void = () => {};

    const App = () => {
      const items = state<Item[]>([
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
        { id: 3, label: 'c' },
      ]);
      setItems = (next) => items.set(next);

      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item, index) => (
              <li data-id={String(item.id)}>{`${item.label}:${index()}`}</li>
            )}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });

    const initial = Array.from(container.querySelectorAll('li')).map(
      (node) => node.textContent
    );
    expect(initial).toEqual(['a:0', 'b:1', 'c:2']);

    setItems([
      { id: 3, label: 'c' },
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ]);
    flushScheduler();

    const reordered = Array.from(container.querySelectorAll('li')).map(
      (node) => node.textContent
    );
    expect(reordered).toEqual(['c:0', 'a:1', 'b:2']);

    cleanup();
  });

  it('should update a single keyed row in place without replacing siblings', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    const initialRows: Item[] = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      label: `row-${index + 1}`,
    }));
    let setItems: (next: Item[]) => void = () => {};

    const App = () => {
      const items = state<Item[]>(initialRows);
      setItems = (next) => items.set(next);

      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item) => <li data-id={String(item.id)}>{item.label}</li>}
          </For>
        </ul>
      );
    };

    try {
      createIsland({ root: container, component: App });

      const beforeNodes = Array.from(container.querySelectorAll('li'));
      const targetBefore = beforeNodes[2];
      const siblingBefore = beforeNodes[1];

      setItems(
        initialRows.map((row) =>
          row.id === 3 ? { ...row, label: 'row-3 updated' } : row
        )
      );
      flushScheduler();

      const afterNodes = Array.from(container.querySelectorAll('li'));
      expect(afterNodes[2]).toBe(targetBefore);
      expect(afterNodes[1]).toBe(siblingBefore);
      expect(afterNodes.map((node) => node.getAttribute('data-id'))).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
      ]);
      expect(afterNodes[2].textContent).toBe('row-3 updated');
      expect(afterNodes[1].textContent).toBe('row-2');
    } finally {
      cleanup();
    }
  });

  it('should keep keyed wrapper rows from rerendering when nested components handle updates', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    const initialRows: Item[] = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      label: `row-${index + 1}`,
    }));
    let setItems: (next: Item[]) => void = () => {};
    let wrapperRenders = 0;

    const Row = ({ item }: { item: Item }) => (
      <li data-id={String(item.id)}>{item.label}</li>
    );

    const App = () => {
      const items = state<Item[]>(initialRows);
      setItems = (next) => items.set(next);

      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item) => ((wrapperRenders += 1), (<Row item={item} />))}
          </For>
        </ul>
      );
    };

    try {
      createIsland({ root: container, component: App });

      expect(wrapperRenders).toBe(initialRows.length);

      const beforeNodes = Array.from(container.querySelectorAll('li'));
      const targetBefore = beforeNodes[2];
      const siblingBefore = beforeNodes[1];

      setItems(
        initialRows.map((row) =>
          row.id === 3 ? { ...row, label: 'row-3 updated' } : row
        )
      );
      flushScheduler();

      const afterNodes = Array.from(container.querySelectorAll('li'));
      expect(afterNodes[2]).toBe(targetBefore);
      expect(afterNodes[1]).toBe(siblingBefore);
      expect(afterNodes.map((node) => node.getAttribute('data-id'))).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
      ]);
      expect(afterNodes[2].textContent).toBe('row-3 updated');
      expect(wrapperRenders).toBe(initialRows.length);
    } finally {
      cleanup();
    }
  });

  it('should clean nested descendants exactly once when a keyed row is removed', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    let setItems: (next: Item[]) => void = () => {};
    const cleanupCounts = new Map<number, number>();
    const localSetters = new Map<number, (next: number) => void>();

    const Nested = ({ id }: { id: number }) => {
      const instance = getCurrentComponentInstance();
      if (!instance) {
        throw new Error('expected nested component instance');
      }

      const local = state(0);
      localSetters.set(id, local.set);
      (instance.cleanupFns ??= []).push(() => {
        cleanupCounts.set(id, (cleanupCounts.get(id) ?? 0) + 1);
      });

      return (
        <button data-nested={String(id)}>
          {id}:{local()}
        </button>
      );
    };

    const App = () => {
      const items = state<Item[]>([
        { id: 1, label: 'alpha' },
        { id: 2, label: 'beta' },
        { id: 3, label: 'gamma' },
      ]);
      setItems = (next) => items.set(next);

      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item) => (
              <li data-id={String(item.id)}>
                {item.label}
                <Nested id={item.id} />
              </li>
            )}
          </For>
        </ul>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      setItems([
        { id: 1, label: 'alpha' },
        { id: 3, label: 'gamma' },
      ]);
      flushScheduler();

      expect(
        Array.from(container.querySelectorAll('li'), (node) =>
          node.getAttribute('data-id')
        )
      ).toEqual(['1', '3']);
      expect(cleanupCounts.get(2)).toBe(1);
      expect(cleanupCounts.get(1) ?? 0).toBe(0);
      expect(cleanupCounts.get(3) ?? 0).toBe(0);

      localSetters.get(2)?.(1);
      flushScheduler();

      expect(container.querySelector('[data-id="2"]')).toBeNull();
      expect(cleanupCounts.get(2)).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should keep row-local state attached to keys across reorder', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    let setItems: (next: Item[]) => void = () => {};

    const Row = ({ item }: { item: Item }) => {
      const local = state(0);

      return (
        <button
          data-row={String(item.id)}
          onClick={() => local.set((value) => value + 1)}
        >
          {item.label}:{local()}
        </button>
      );
    };

    const App = () => {
      const items = state<Item[]>([
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
        { id: 3, label: 'c' },
      ]);
      setItems = (next) => items.set(next);

      return (
        <div>
          <For each={items} by={(item) => item.id}>
            {(item) => <Row item={item} />}
          </For>
        </div>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      const rowTwoBefore = container.querySelector(
        '[data-row="2"]'
      ) as HTMLButtonElement;
      rowTwoBefore.click();
      flushScheduler();

      expect(rowTwoBefore.textContent).toBe('b:1');

      setItems([
        { id: 3, label: 'c' },
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
      ]);
      flushScheduler();

      const rows = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[data-row]')
      );
      expect(rows.map((row) => row.getAttribute('data-row'))).toEqual([
        '3',
        '1',
        '2',
      ]);
      expect(rows.map((row) => row.textContent)).toEqual(['c:0', 'a:0', 'b:1']);
      expect(container.querySelector('[data-row="2"]')).toBe(rowTwoBefore);
    } finally {
      cleanup();
    }
  });

  it('should dispose only removed nested For and Show ownership', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string; showDetails: boolean };
    let setItems: (next: Item[]) => void = () => {};
    const rowCleanups = new Map<number, number>();
    const detailCleanups = new Map<number, number>();

    const Details = ({ id }: { id: number }) => {
      const instance = getCurrentComponentInstance();
      if (!instance) {
        throw new Error('expected details component instance');
      }
      (instance.cleanupFns ??= []).push(() => {
        detailCleanups.set(id, (detailCleanups.get(id) ?? 0) + 1);
      });

      return <span data-detail={String(id)}>{`detail:${String(id)}`}</span>;
    };

    const Row = ({ item }: { item: Item }) => {
      const instance = getCurrentComponentInstance();
      if (!instance) {
        throw new Error('expected row component instance');
      }
      (instance.cleanupFns ??= []).push(() => {
        rowCleanups.set(item.id, (rowCleanups.get(item.id) ?? 0) + 1);
      });

      return (
        <li data-row={String(item.id)}>
          {item.label}
          <Show when={item.showDetails}>
            <Details id={item.id} />
          </Show>
        </li>
      );
    };

    const App = () => {
      const items = state<Item[]>([
        { id: 1, label: 'alpha', showDetails: true },
        { id: 2, label: 'beta', showDetails: true },
        { id: 3, label: 'gamma', showDetails: true },
      ]);
      setItems = (next) => items.set(next);

      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item) => <Row item={item} />}
          </For>
        </ul>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      setItems([
        { id: 1, label: 'alpha', showDetails: true },
        { id: 3, label: 'gamma', showDetails: false },
      ]);
      flushScheduler();

      expect(
        Array.from(container.querySelectorAll('[data-row]'), (node) =>
          node.getAttribute('data-row')
        )
      ).toEqual(['1', '3']);
      expect(
        Array.from(container.querySelectorAll('[data-detail]'), (node) =>
          node.getAttribute('data-detail')
        )
      ).toEqual(['1']);
      expect(rowCleanups.get(1) ?? 0).toBe(0);
      expect(rowCleanups.get(2)).toBe(1);
      expect(rowCleanups.get(3) ?? 0).toBe(0);
      expect(detailCleanups.get(1) ?? 0).toBe(0);
      expect(detailCleanups.get(2)).toBe(1);
      expect(detailCleanups.get(3)).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should not subscribe a parent to cloned vnode item property updates', () => {
    const { container, cleanup } = createTestContainer();
    let closePanel: () => void = () => {};
    let appRenders = 0;

    const App = () => {
      appRenders += 1;
      const open = state(true);
      closePanel = () => open.set(false);
      const label = open() ? 'Panel open' : 'Panel closed';
      const children = [
        <span key="panel-link" data-slot="panel-link">
          {label}
        </span>,
      ];

      return (
        <section data-open={open() ? 'true' : 'false'}>
          <For each={() => children} by={() => 'panel-link'}>
            {(child) => child as JSXElement}
          </For>
        </section>
      );
    };

    try {
      createIsland({ root: container, component: App });

      expect(
        container.querySelector('section')?.getAttribute('data-open')
      ).toBe('true');
      expect(
        container.querySelector('[data-slot="panel-link"]')?.textContent
      ).toBe('Panel open');

      closePanel();
      flushScheduler();

      expect(
        container.querySelector('section')?.getAttribute('data-open')
      ).toBe('false');
      expect(
        container.querySelector('[data-slot="panel-link"]')?.textContent
      ).toBe('Panel open');
      expect(appRenders).toBeLessThan(5);
    } finally {
      cleanup();
    }
  });

  it('should update shifted index accessors after removing one keyed row from the middle', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    const rowA = { id: 1, label: 'a' };
    const rowB = { id: 2, label: 'b' };
    const rowC = { id: 3, label: 'c' };
    let setItems: (next: Item[]) => void = () => {};

    const App = () => {
      const items = state<Item[]>([rowA, rowB, rowC]);
      setItems = (next) => items.set(next);

      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item, index) => (
              <li data-id={String(item.id)}>{`${item.label}:${index()}`}</li>
            )}
          </For>
        </ul>
      );
    };

    try {
      createIsland({ root: container, component: App });

      setItems([rowA, rowC]);
      flushScheduler();

      const shifted = Array.from(container.querySelectorAll('li')).map(
        (node) => node.textContent
      );
      expect(shifted).toEqual(['a:0', 'c:1']);
    } finally {
      cleanup();
    }
  });

  it('should report the current keyed index even when index() is first read after a reorder', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    let setItems: (next: Item[]) => void = () => {};
    let setShowIndices: (next: boolean) => void = () => {};

    const App = () => {
      const items = state<Item[]>([
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
        { id: 3, label: 'c' },
      ]);
      const showIndices = state(false);
      setItems = (next) => items.set(next);
      setShowIndices = (next) => showIndices.set(next);

      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item, index) => (
              <li data-id={String(item.id)}>
                {() =>
                  showIndices() ? `${item.label}:${index()}` : item.label
                }
              </li>
            )}
          </For>
        </ul>
      );
    };

    try {
      createIsland({ root: container, component: App });

      setItems([
        { id: 3, label: 'c' },
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
      ]);
      flushScheduler();

      setShowIndices(true);
      flushScheduler();

      const labels = Array.from(container.querySelectorAll('li')).map(
        (node) => node.textContent
      );
      expect(labels).toEqual(['c:0', 'a:1', 'b:2']);
    } finally {
      cleanup();
    }
  });

  it('should keep delayed index() reads correct for move-only keyed reorders', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    const rowA = { id: 1, label: 'a' };
    const rowB = { id: 2, label: 'b' };
    const rowC = { id: 3, label: 'c' };
    let setItems: (next: Item[]) => void = () => {};
    let setShowIndices: (next: boolean) => void = () => {};

    const App = () => {
      const items = state<Item[]>([rowA, rowB, rowC]);
      const showIndices = state(false);
      setItems = (next) => items.set(next);
      setShowIndices = (next) => showIndices.set(next);

      return (
        <ul>
          <For each={items} by={(item) => item.id}>
            {(item, index) => (
              <li data-id={String(item.id)}>
                {() =>
                  showIndices() ? `${item.label}:${index()}` : item.label
                }
              </li>
            )}
          </For>
        </ul>
      );
    };

    try {
      createIsland({ root: container, component: App });

      setItems([rowC, rowA, rowB]);
      flushScheduler();

      setShowIndices(true);
      flushScheduler();

      const labels = Array.from(container.querySelectorAll('li')).map(
        (node) => node.textContent
      );
      expect(labels).toEqual(['c:0', 'a:1', 'b:2']);
    } finally {
      cleanup();
    }
  });

  it('should support byIndex as an explicit positional escape hatch', () => {
    const { container, cleanup } = createTestContainer();
    let setItems: (next: string[]) => void = () => {};

    const App = () => {
      const items = state(['a', 'b']);
      setItems = (next) => items.set(next);

      return (
        <ul>
          <For each={items} byIndex={true}>
            {(item, index) => <li>{`${item}:${index()}`}</li>}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    expect(container.textContent).toContain('a:0');
    expect(container.textContent).toContain('b:1');

    setItems(['x', 'y']);
    flushScheduler();

    expect(container.textContent).toContain('x:0');
    expect(container.textContent).toContain('y:1');

    cleanup();
  });

  it('should materialize index keys when iterating JSX element values', () => {
    const { container, cleanup } = createTestContainer();

    const children = [<span>A</span>, <span>B</span>];

    const App = () => (
      <div>
        <For each={() => children} byIndex={true}>
          {(child) => child as never}
        </For>
      </div>
    );

    expect(() =>
      createIsland({ root: container, component: App })
    ).not.toThrow();

    const keyedChildren = Array.from(container.querySelectorAll('span')).map(
      (node) => ({
        key: node.getAttribute('data-key'),
        text: node.textContent,
      })
    );

    expect(keyedChildren).toEqual([
      { key: '0', text: 'A' },
      { key: '1', text: 'B' },
    ]);

    cleanup();
  });

  it('should render fallback when the list is empty and restore rows afterward', () => {
    const { container, cleanup } = createTestContainer();
    type Item = { id: number; label: string };
    let setItems: (next: Item[]) => void = () => {};

    const App = () => {
      const items = state<Item[]>([]);
      setItems = (next) => items.set(next);

      return (
        <ul>
          <For
            each={items}
            by={(item) => item.id}
            fallback={<li id="empty">empty</li>}
          >
            {(item) => <li data-id={String(item.id)}>{item.label}</li>}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    expect(container.querySelector('#empty')?.textContent).toBe('empty');

    setItems([{ id: 1, label: 'row-1' }]);
    flushScheduler();
    expect(container.querySelector('#empty')).toBeNull();
    expect(container.querySelector('li[data-id="1"]')?.textContent).toBe(
      'row-1'
    );

    setItems([]);
    flushScheduler();
    expect(container.querySelector('#empty')?.textContent).toBe('empty');

    cleanup();
  });

  it('should render keyed rows from a resource-fed array after the resource resolves', async () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    let resolveItems: ((items: Item[]) => void) | null = null;

    const App = () => {
      const items = resource<Item[]>(
        () =>
          new Promise<Item[]>((resolve) => {
            resolveItems = resolve;
          }),
        []
      );

      return (
        <ul>
          <For
            each={() => items.value ?? []}
            by={(item) => item.id}
            fallback={<li id="resource-empty">empty</li>}
          >
            {(item) => <li data-id={String(item.id)}>{item.label}</li>}
          </For>
        </ul>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      expect(container.querySelector('#resource-empty')?.textContent).toBe(
        'empty'
      );

      resolveItems?.([
        { id: 1, label: 'row-1' },
        { id: 2, label: 'row-2' },
      ]);
      await waitForNextEvaluation();
      flushScheduler();

      const rows = Array.from(container.querySelectorAll('li[data-id]')).map(
        (node) => node.textContent
      );
      expect(container.querySelector('#resource-empty')).toBeNull();
      expect(rows).toEqual(['row-1', 'row-2']);
    } finally {
      cleanup();
    }
  });

  it('should update nested keyed For lists across outer reorders and inner list changes', () => {
    const { container, cleanup } = createTestContainer();

    type Row = { id: number; label: string };
    type Group = { id: number; label: string; items: Row[] };
    let setGroups: (next: Group[]) => void = () => {};

    const App = () => {
      const groups = state<Group[]>([
        {
          id: 1,
          label: 'A',
          items: [
            { id: 11, label: 'a' },
            { id: 12, label: 'b' },
          ],
        },
        {
          id: 2,
          label: 'B',
          items: [{ id: 21, label: 'c' }],
        },
      ]);
      setGroups = (next) => groups.set(next);

      return (
        <section>
          <For each={groups} by={(group) => group.id}>
            {(group, groupIndex) => (
              <article data-group={String(group.id)}>
                <h2>{`${group.label}:${groupIndex()}`}</h2>
                <ul>
                  <For each={() => group.items} by={(item) => item.id}>
                    {(item, itemIndex) => (
                      <li data-item={`${group.id}-${item.id}`}>
                        {`${group.label}:${groupIndex()}/${item.label}:${itemIndex()}`}
                      </li>
                    )}
                  </For>
                </ul>
              </article>
            )}
          </For>
        </section>
      );
    };

    try {
      createIsland({ root: container, component: App });

      const initialGroups = Array.from(container.querySelectorAll('h2')).map(
        (node) => node.textContent
      );
      const initialRows = Array.from(container.querySelectorAll('li')).map(
        (node) => node.textContent
      );
      expect(initialGroups).toEqual(['A:0', 'B:1']);
      expect(initialRows).toEqual(['A:0/a:0', 'A:0/b:1', 'B:1/c:0']);

      setGroups([
        {
          id: 2,
          label: 'B',
          items: [
            { id: 21, label: 'c' },
            { id: 22, label: 'd' },
          ],
        },
        {
          id: 1,
          label: 'A',
          items: [{ id: 12, label: 'b!' }],
        },
      ]);
      flushScheduler();

      const nextGroups = Array.from(container.querySelectorAll('h2')).map(
        (node) => node.textContent
      );
      const nextRows = Array.from(container.querySelectorAll('li')).map(
        (node) => node.textContent
      );
      expect(nextGroups).toEqual(['B:0', 'A:1']);
      expect(nextRows).toEqual(['B:0/c:0', 'B:0/d:1', 'A:1/b!:0']);
    } finally {
      cleanup();
    }
  });

  it('should pass array items through as native arrays for nested For lists', () => {
    const { container, cleanup } = createTestContainer();
    let setRows: (next: string[][]) => void = () => {};

    const App = () => {
      const rows = state<string[][]>([
        ['a1', 'a2'],
        ['b1', 'b2'],
      ]);
      setRows = (next) => rows.set(next);

      return (
        <table>
          <tbody>
            <For each={rows} byIndex={true}>
              {(row, rowIndex) => {
                const rowJson = JSON.stringify(row);

                return (
                  <tr
                    data-row={String(rowIndex())}
                    data-array={String(Array.isArray(row))}
                    data-json={rowJson}
                  >
                    <For each={row} byIndex={true}>
                      {(cell, cellIndex) => (
                        <td data-cell={`${rowIndex()}-${cellIndex()}`}>
                          {cell}
                        </td>
                      )}
                    </For>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      );
    };

    try {
      createIsland({ root: container, component: App });

      const initialRows = Array.from(container.querySelectorAll('tr'));
      expect(initialRows.map((row) => row.getAttribute('data-array'))).toEqual([
        'true',
        'true',
      ]);
      expect(initialRows.map((row) => row.getAttribute('data-json'))).toEqual([
        '["a1","a2"]',
        '["b1","b2"]',
      ]);
      expect(
        Array.from(container.querySelectorAll('td')).map(
          (node) => node.textContent
        )
      ).toEqual(['a1', 'a2', 'b1', 'b2']);

      setRows([
        ['a1', 'a3'],
        ['b1', 'b2', 'b3'],
      ]);
      flushScheduler();

      const nextRows = Array.from(container.querySelectorAll('tr'));
      expect(nextRows.map((row) => row.getAttribute('data-array'))).toEqual([
        'true',
        'true',
      ]);
      expect(nextRows.map((row) => row.getAttribute('data-json'))).toEqual([
        '["a1","a3"]',
        '["b1","b2","b3"]',
      ]);
      expect(
        Array.from(container.querySelectorAll('td')).map(
          (node) => node.textContent
        )
      ).toEqual(['a1', 'a3', 'b1', 'b2', 'b3']);
    } finally {
      cleanup();
    }
  });

  it('should throw when neither by nor byIndex is provided', () => {
    const { container, cleanup } = createTestContainer();
    const UnsafeFor = For as unknown as (
      props: Record<string, unknown>
    ) => JSXElement;

    const App = () => (
      <div>
        <UnsafeFor
          each={[1, 2, 3]}
          children={(item: number) => <span>{item}</span>}
        />
      </div>
    );

    expect(() => createIsland({ root: container, component: App })).toThrow(
      /requires a stable `by` key function/
    );

    cleanup();
  });
});
