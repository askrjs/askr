import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('state destructuring (STATE)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  it('should support destructuring into [getter, setter]', () => {
    let getter: ReturnType<typeof state<number>> | null = null;
    let setter: ((v: number | ((p: number) => number)) => void) | null = null;

    const Component = () => {
      [getter, setter] = state(0);
      return <div>{String(getter!())}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('0');

    setter!(1);
    flushScheduler();
    expect(container.textContent).toBe('1');

    // setter should be the same as getter.set
    expect(setter).toBe(getter!.set);
  });

  it('should allow destructuring directly from state() call (tuple)', () => {
    let g: ReturnType<typeof state<number>> | null = null;
    let s: ((v: number | ((p: number) => number)) => void) | null = null;

    const Component = () => {
      [g, s] = state(5);
      return <div>{g!()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('5');

    s!(10);
    flushScheduler();
    expect(container.textContent).toBe('10');
  });
});
