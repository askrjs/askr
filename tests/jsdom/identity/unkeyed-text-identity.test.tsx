import { describe, it, beforeAll, afterAll, expect } from 'vite-plus/test';
import { state } from '../../../src/index';
import type { State } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('bulk text fast-path (unkeyed)', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let items: State<number[]>;

  beforeAll(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;

    const Component = () => {
      items = state(Array.from({ length: 20 }, (_, i) => i));
      return (
        <ul>
          {items().map((item: number) => (
            <li>{'Item ' + item}</li>
          ))}
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
  });

  it('should update unkeyed text while preserving identity and listeners', () => {
    const beforeEls = Array.from(container.querySelectorAll('li'));
    expect(beforeEls.length).toBe(20);

    // Attach a listener to first item
    let clickCount = 0;
    beforeEls[0].addEventListener('click', () => {
      clickCount++;
    });

    // Perform bulk update
    items.set(items().map((x: number) => x + 1));
    flushScheduler();

    const afterEls = Array.from(container.querySelectorAll('li'));
    expect(afterEls.map((item) => item.textContent)).toEqual(
      Array.from({ length: 20 }, (_, i) => `Item ${i + 1}`)
    );
    // Identity preserved
    for (let i = 0; i < beforeEls.length; i++) {
      expect(afterEls[i]).toBe(beforeEls[i]);
    }

    // Listener preserved (dispatch click)
    afterEls[0].dispatchEvent(new Event('click'));
    expect(clickCount).toBe(1);
  });

  afterAll(() => {
    cleanup();
  });
});
