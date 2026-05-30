import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state, derive } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('derive() recompute / re-run timing (B2)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  // A derived whose value does NOT change after an upstream write must not
  // re-render the consuming component (fine-grained memoization).
  it('should not re-render the consumer when the derived value is unchanged', () => {
    let renders = 0;
    let count!: ReturnType<typeof state<number>>;

    const Component = () => {
      renders += 1;
      count = state(0);
      const positive = derive(() => count() > 0);
      return <div>{positive() ? 'yes' : 'no'}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('no');
    const rendersAfterMount = renders;

    // 0 -> 1 flips the derived from false to true: consumer must re-render once.
    count.set(1);
    flushScheduler();
    expect(container.textContent).toBe('yes');
    const rendersAfterFirstChange = renders;
    expect(rendersAfterFirstChange).toBe(rendersAfterMount + 1);

    // 1 -> 2 keeps the derived `true`: consumer must NOT re-render.
    count.set(2);
    flushScheduler();
    expect(container.textContent).toBe('yes');
    expect(renders).toBe(rendersAfterFirstChange);

    // 2 -> 3 still `true`: still no re-render.
    count.set(3);
    flushScheduler();
    expect(renders).toBe(rendersAfterFirstChange);
  });

  it('should re-render the consumer exactly once when the derived value changes', () => {
    let renders = 0;
    let count!: ReturnType<typeof state<number>>;

    const Component = () => {
      renders += 1;
      count = state(0);
      const doubled = derive(() => count() * 2);
      return <div>{doubled()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('0');
    const base = renders;

    count.set(5);
    flushScheduler();
    expect(container.textContent).toBe('10');
    expect(renders).toBe(base + 1);
  });
});
