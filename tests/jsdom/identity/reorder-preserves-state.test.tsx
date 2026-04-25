// tests/identity/reorder_preserves_state.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { createTestContainer, flushScheduler } from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('reorder preserves state (IDENTITY)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should persist keyed state across reorder', async () => {
    let items: ReturnType<
      typeof state<Array<{ id: string; label: string }>>
    > | null = null;

    const Component = () => {
      items = state([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ]);
      return (
        <div>
          {items().map((item) => (
            <div key={item.id} data-id={item.id}>
              {item.label}
            </div>
          ))}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const b = container.querySelector('[data-id="b"]') as HTMLElement;
    (b as unknown as Record<string, unknown>).__localState = 123;

    items!.set([
      { id: 'c', label: 'C' },
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    flushScheduler();

    const b2 = container.querySelector('[data-id="b"]') as HTMLElement;
    expect(b2).toBe(b);
    expect((b2 as unknown as Record<string, unknown>).__localState).toBe(123);
  });

  it('should follow key identity for local state', async () => {
    let items: ReturnType<
      typeof state<Array<{ id: string; label: string }>>
    > | null = null;

    const Component = () => {
      items = state([
        { id: 'x', label: 'X' },
        { id: 'y', label: 'Y' },
      ]);
      return (
        <div>
          {items().map((item) => (
            <div key={item.id} data-id={item.id}>
              {item.label}
            </div>
          ))}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const x = container.querySelector('[data-id="x"]') as HTMLElement;
    const y = container.querySelector('[data-id="y"]') as HTMLElement;
    (x as unknown as Record<string, unknown>).__localState = 'x-state';
    (y as unknown as Record<string, unknown>).__localState = 'y-state';

    items!.set([
      { id: 'y', label: 'Y' },
      { id: 'x', label: 'X' },
    ]);
    flushScheduler();

    expect(
      (
        container.querySelector('[data-id="x"]') as unknown as Record<
          string,
          unknown
        >
      ).__localState
    ).toBe('x-state');
    expect(
      (
        container.querySelector('[data-id="y"]') as unknown as Record<
          string,
          unknown
        >
      ).__localState
    ).toBe('y-state');
  });
});
