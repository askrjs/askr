// tests/identity/positional_identity.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state, createIsland } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

describe('positional identity (IDENTITY)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should use positional identity for unkeyed items', async () => {
    let items: ReturnType<typeof state<string[]>> | null = null;

    const Component = () => {
      items = state(['A', 'B', 'C']);
      return {
        type: 'div',
        children: items().map((label, i) => ({
          type: 'div',
          props: { 'data-index': i },
          children: [label],
        })),
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const root = container.children[0] as HTMLElement;
    const second = root.children[1] as HTMLElement;
    (second as unknown as Record<string, unknown>).__localState = 'second';

    items!.set(['C', 'A', 'B']);
    flushScheduler();

    // Positional identity: the element at index 1 keeps its local state
    const newSecond = root.children[1] as HTMLElement;
    expect((newSecond as unknown as Record<string, unknown>).__localState).toBe(
      'second'
    );
  });

  it('should affect which element renders when position changes', async () => {
    let items: ReturnType<typeof state<string[]>> | null = null;

    const Component = () => {
      items = state(['A', 'B', 'C']);
      return {
        type: 'div',
        children: items().map((label) => ({
          type: 'div',
          children: [label],
        })),
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const root = container.children[0] as HTMLElement;
    const before = Array.from(root.children).map((n) => n.textContent);
    expect(before).toContain('B');

    items!.set(['C', 'A', 'B']);
    flushScheduler();

    const after = Array.from(root.children).map((n) => n.textContent);
    expect(after[1]).toBe('A');
  });
});
