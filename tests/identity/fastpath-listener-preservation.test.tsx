import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { state } from '../../src/index';
import type { State } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('renderer fast-path listener preservation', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items!: State<Array<{ id: number; text: string }>>;

  beforeAll(async () => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;

    const Component = () => {
      items = state(
        Array.from({ length: 200 }, (_, i) => ({
          id: i + 1,
          text: `Item ${i + 1}`,
        }))
      );
      return {
        type: 'ul',
        children: items().map((item) => ({
          type: 'li',
          key: item.id,
          props: { 'data-key': String(item.id) },
          children: [item.text],
        })),
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await waitForNextEvaluation();
  });

  it('should preserve listeners when renderer fast-path reuses elements', async () => {
    const beforeEls = Array.from(container.querySelectorAll('li'));
    expect(beforeEls.length).toBe(200);

    let clickCount = 0;
    // Attach a native listener directly to the FIRST element and record its key
    const targetKey = beforeEls[0].getAttribute('data-key')!;
    beforeEls[0].addEventListener('click', () => clickCount++);

    // Trigger large reorder-only update to exercise renderer fast-path
    items.set([...items()].reverse());
    flushScheduler();
    await waitForNextEvaluation();

    // Find the element that still has the original data-key and fire its listener
    const targetAfter = container.querySelector(`li[data-key="${targetKey}"]`);
    expect(targetAfter).toBeTruthy();
    (targetAfter as Element).dispatchEvent(new Event('click'));
    expect(clickCount).toBe(1);

    // As additional safety, ensure the element at position 0 now has expected key
    const afterEls = Array.from(container.querySelectorAll('li'));
    expect(afterEls.length).toBe(200);
    expect(afterEls[0].getAttribute('data-key')).toBe(String(items()[0].id));
  });

  afterAll(() => {
    cleanup();
  });
});
