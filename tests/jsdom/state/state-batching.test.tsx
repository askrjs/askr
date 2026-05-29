import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('state() batching / re-run count (B4)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  // Two writes in a single event handler must coalesce to ONE re-render.
  it('should coalesce two set() calls in one handler into a single re-render', () => {
    let renders = 0;
    let a!: ReturnType<typeof state<number>>;
    let b!: ReturnType<typeof state<number>>;

    const Component = () => {
      renders += 1;
      a = state(0);
      b = state(0);
      return (
        <button
          onClick={() => {
            a.set(1);
            b.set(1);
          }}
        >
          {a()}-{b()}
        </button>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('0-0');
    const base = renders;

    (container.firstElementChild as HTMLButtonElement).click();
    flushScheduler();

    expect(container.textContent).toBe('1-1');
    // Exactly one re-render for the two batched writes.
    expect(renders).toBe(base + 1);
  });

  // A write that reverts to the original value within the same batch must end
  // up with the original value and must not leave the component re-rendering
  // with a wrong value.
  it('should settle on the final value when a write is reverted in the same batch', () => {
    let renders = 0;
    let n!: ReturnType<typeof state<number>>;

    const Component = () => {
      renders += 1;
      n = state(0);
      return (
        <button
          onClick={() => {
            n.set(5);
            n.set(0); // revert within the same handler
          }}
        >
          {n()}
        </button>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('0');
    const base = renders;

    (container.firstElementChild as HTMLButtonElement).click();
    flushScheduler();

    // Value is back to 0; at most one re-render should have been scheduled.
    expect(container.textContent).toBe('0');
    expect(renders).toBeLessThanOrEqual(base + 1);
  });
});
