import { describe, it, expect } from 'vite-plus/test';
import { state } from '../../../src/index';
import { resource } from '../../../src/resources';
import { For } from '@askrjs/askr/control';
import type { JSXElement } from '../../../src/jsx/types';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('For JSX primitive', () => {
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
