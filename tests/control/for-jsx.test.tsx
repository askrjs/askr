import { describe, it, expect } from 'vite-plus/test';
import { For, state } from '../../src/index';
import type { JSXElement } from '../../src/jsx/types';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

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
