import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state, derive } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('scratch: reentrancy', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  it('self-recursive derive() (reads itself synchronously) must throw the documented error, not corrupt state', () => {
    let x!: ReturnType<typeof state<number>>;
    let caught: unknown = null;

    const Component = () => {
      x = state(1);
      const selfRef: { current: (() => number) | null } = { current: null };
      const recursive = derive(() => {
        const v = x();
        if (v > 1 && selfRef.current) {
          // synchronously call itself during its own evaluation
          try {
            selfRef.current();
          } catch (e) {
            caught = e;
          }
        }
        return v;
      });
      selfRef.current = recursive;
      return <div>{recursive()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('1');

    x.set(2);
    flushScheduler();

    expect(caught).not.toBeNull();
    expect((caught as Error).message).toMatch(/cannot read itself recursively/);

    // After the caught recursive error, the derive must still function
    // correctly for subsequent updates (no leaked _evaluating=true, no
    // corrupted currentDerivedSubscriber).
    x.set(3);
    flushScheduler();
    expect(container.textContent).toBe('3');
  });
});

describe('scratch: exceptions mid-track leaking currentDerivedSubscriber', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  it('a derive that throws after reading one signal must not corrupt an unrelated derive evaluated right after it', () => {
    let s1!: ReturnType<typeof state<number>>;
    let s2!: ReturnType<typeof state<number>>;
    let shouldThrow = false;
    let innocentComputeCount = 0;
    let innocentSources: string[] = [];

    const Component = () => {
      s1 = state(1);
      s2 = state(100);

      const throwing = derive(() => {
        const v = s1(); // read s1 before throwing
        if (shouldThrow) {
          throw new Error('boom mid-track');
        }
        return v;
      });

      // Evaluated independently; must only ever depend on s2.
      const innocent = derive(() => {
        innocentComputeCount++;
        return s2();
      });

      let throwingVal: number | string = 'error';
      try {
        throwingVal = throwing();
      } catch {
        throwingVal = 'error';
      }

      return (
        <div>
          {throwingVal}-{innocent()}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('1-100');

    shouldThrow = true;
    s1.set(2);
    flushScheduler();

    // If currentDerivedSubscriber leaked (not reset in a finally), the very
    // next read of s2 during this same synchronous flush turn might get
    // wrongly attributed to `throwing`'s subscriber instead of nobody / the
    // correct subscriber. We probe for corruption by mutating s2 alone next
    // and confirming `innocent` still reacts exactly once, and that
    // `throwing`'s dependency set wasn't polluted with s2 (which would cause
    // s2 mutations to spuriously re-dirty `throwing`).
    const innocentCountAfterS1Throw = innocentComputeCount;

    s2.set(200);
    flushScheduler();
    expect(container.textContent).toBe('error-200');
    expect(innocentComputeCount).toBe(innocentCountAfterS1Throw + 1);

    // Now let throwing recover; it should resubscribe to s1 correctly and
    // not carry any bogus dependency on s2 that would double-fire.
    shouldThrow = false;
    s1.set(3);
    flushScheduler();
    expect(container.textContent).toBe('3-200');
  });
});
