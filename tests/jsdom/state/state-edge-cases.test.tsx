import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('state edge cases (STATE)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  // Finding 5 (DEBATABLE): a function argument to set() is always treated as a
  // functional updater, so a function cannot be stored directly. The supported
  // pattern is to wrap it in an object. This pins the documented limitation.
  it('should treat a function argument to set() as an updater, not a stored value', () => {
    let fnState!: ReturnType<typeof state<unknown>>;
    const initial = () => 'initial';
    const replacement = () => 'replacement';

    const Component = () => {
      fnState = state<unknown>(initial);
      return <div>{typeof fnState()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    // The initial value (a function) is stored fine because it is not set().
    expect(container.textContent).toBe('function');
    expect(fnState!()).toBe(initial);

    // Passing a function to set() runs it as an updater (prev=initial) and
    // stores its RETURN value ('replacement' here) — the function itself is
    // NOT stored. This pins the documented limitation.
    fnState!.set(replacement);
    flushScheduler();
    expect(container.textContent).toBe('string');
    expect(fnState!()).toBe('replacement');
    expect(fnState!()).not.toBe(replacement);
  });

  it('should store a function value when wrapped in an object', () => {
    let boxed!: ReturnType<typeof state<{ fn: () => string }>>;

    const Component = () => {
      boxed = state<{ fn: () => string }>({ fn: () => 'a' });
      return <div>{boxed().fn()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('a');

    boxed!.set({ fn: () => 'b' });
    flushScheduler();
    expect(container.textContent).toBe('b');
  });

  // Finding 7 (PROBE): Object.is set semantics.
  it('should treat set(NaN) after NaN as a no-op (Object.is)', () => {
    let renders = 0;
    let s!: ReturnType<typeof state<number>>;

    const Component = () => {
      renders += 1;
      s = state(Number.NaN);
      return <div>{Number.isNaN(s()) ? 'nan' : String(s())}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('nan');
    const rendersAfterMount = renders;

    s!.set(Number.NaN);
    flushScheduler();

    // No value change under Object.is -> no re-render.
    expect(renders).toBe(rendersAfterMount);
  });

  it('should treat +0 -> -0 as a change (Object.is distinguishes signed zero)', () => {
    let s!: ReturnType<typeof state<number>>;

    const Component = () => {
      s = state(0);
      return <div>{Object.is(s(), -0) ? 'neg' : 'pos'}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('pos');

    s!.set(-0);
    flushScheduler();
    expect(container.textContent).toBe('neg');
  });
});
