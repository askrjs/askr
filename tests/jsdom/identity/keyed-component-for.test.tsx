import { describe, it, expect } from 'vite-plus/test';
import { state, For } from '../../../src/index';
import { createTestContainer, flushScheduler } from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('keyed component identity in For loop', () => {
  it('should preserve DOM node identity when reordering components in For loop', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    let setItems: (v: Item[]) => void = () => {};

    const Row = ({ label }: { label: string }) => {
      // Return a simple div. The key should be materialized here by the renderer.
      return <div class="row">{label}</div>;
    };

    const App = () => {
      const items = state<Item[]>([
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
        { id: 3, label: 'c' },
      ]);
      setItems = (v: Item[]) => items.set(v);

      return (
        <div>
          {
            <For each={items} by={(i) => i.id}>
              {(item) => <Row label={item.label} />}
            </For>
          }
        </div>
      );
    };

    createIsland({ root: container, component: App });

    // Initial state check
    const rowsInitial = Array.from(
      container.querySelectorAll('.row')
    ) as HTMLElement[];
    expect(rowsInitial).toHaveLength(3);
    expect(rowsInitial[0].textContent).toBe('a');
    expect(rowsInitial[1].textContent).toBe('b');
    expect(rowsInitial[2].textContent).toBe('c');

    // Store references to the DOM elements
    const elA = rowsInitial[0];
    const elB = rowsInitial[1];
    const elC = rowsInitial[2];

    // Swap elements (like the JFB swap test)
    setItems([
      { id: 1, label: 'a' },
      { id: 3, label: 'c' },
      { id: 2, label: 'b' },
    ]);
    flushScheduler();

    const rowsAfter = Array.from(
      container.querySelectorAll('.row')
    ) as HTMLElement[];
    expect(rowsAfter).toHaveLength(3);
    expect(rowsAfter[0]).toBe(elA);
    expect(rowsAfter[1]).toBe(elC);
    expect(rowsAfter[2]).toBe(elB);

    // Verify they are the EXACT same DOM instances
    expect(rowsAfter[1]).toBe(elC);
    expect(rowsAfter[2]).toBe(elB);

    cleanup();
  });

  it('should preserve DOM node identity when component root is another component', () => {
    const { container, cleanup } = createTestContainer();

    type Item = { id: number; label: string };
    let setItems: (v: Item[]) => void = () => {};

    const Inner = ({ label }: { label: string }) => {
      return <div class="inner">{label}</div>;
    };

    const Outer = ({ label }: { label: string }) => {
      // Returns another component
      return <Inner label={label} />;
    };

    const App = () => {
      const items = state<Item[]>([
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
      ]);
      setItems = (v: Item[]) => items.set(v);

      return (
        <div>
          {
            <For each={items} by={(i) => i.id}>
              {(item) => <Outer label={item.label} />}
            </For>
          }
        </div>
      );
    };

    createIsland({ root: container, component: App });

    const rowsInitial = Array.from(
      container.querySelectorAll('.inner')
    ) as HTMLElement[];
    expect(rowsInitial).toHaveLength(2);
    // Check if data-key is present
    expect(rowsInitial[0].getAttribute('data-key')).toBe('1');
    expect(rowsInitial[1].getAttribute('data-key')).toBe('2');

    const elA = rowsInitial[0];
    const elB = rowsInitial[1];

    // Reorder and update labels
    setItems([
      { id: 2, label: 'b-updated' },
      { id: 1, label: 'a-updated' },
    ]);
    flushScheduler();

    const rowsAfter = Array.from(
      container.querySelectorAll('.inner')
    ) as HTMLElement[];
    expect(rowsAfter[0]).toBe(elB);
    expect(rowsAfter[1]).toBe(elA);
    expect(rowsAfter[0].textContent).toBe('b-updated');
    expect(rowsAfter[1].textContent).toBe('a-updated');

    cleanup();
  });
});
