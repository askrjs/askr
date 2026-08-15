import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state, derive } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('scratch: async gap tracking', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  it('async derive compute: does a read after await get tracked, and does it corrupt a concurrently-evaluating derive?', async () => {
    let a!: ReturnType<typeof state<number>>;
    let b!: ReturnType<typeof state<number>>;
    let c!: ReturnType<typeof state<number>>;

    let asyncComputeCalls = 0;
    let syncComputeCalls = 0;

    const Component = () => {
      a = state(1);
      b = state(2);
      c = state(100);

      // "async-ish" derive: reads `a` synchronously, then simulates a gap via
      // Promise.resolve().then before reading `b`. derive() computes must be
      // synchronous by contract, but nothing stops a user from doing this —
      // we're checking what actually happens, not whether it's "supported".
      const weird = derive(() => {
        asyncComputeCalls++;
        const av = a();
        // Fire off a microtask read of b() and c() outside the synchronous
        // tracking window, then immediately return based on `a` only.
        Promise.resolve().then(() => {
          // This read happens after withDerivedReadTracking's finally has run.
          b();
        });
        return av;
      });

      // A second, fully synchronous & unrelated derive, evaluated
      // immediately after `weird` during the same render.
      const clean = derive(() => {
        syncComputeCalls++;
        return c();
      });

      return <div>{weird()}-{clean()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('1-100');

    // Let the microtask (b() read inside weird's compute) run.
    await Promise.resolve();
    await Promise.resolve();

    // Now mutate `b`. If the microtask read of b() inside weird's compute
    // was incorrectly attributed as a dependency of `clean` (because
    // currentDerivedSubscriber had already been reset/reused by the time the
    // microtask ran), or if it was dropped entirely (no subscriber active),
    // we should see it here via one of two failure modes:
    //  1. clean's dependency set wrongly includes b (corruption) -> mutating
    //     b would cause clean to recompute/its consumers to re-render even
    //     though clean() never reads b in its own compute.
    //  2. weird's dependency set does NOT include b (dropped) -> mutating b
    //     produces no update to weird, even though weird's compute body
    //     texually reads b() (deferred).
    const cleanRendersBefore = syncComputeCalls;
    b.set(999);
    flushScheduler();

    // Expected (correct fine-grained tracking, if async reads were honored):
    // weird's value doesn't depend on `a` alone anymore is not the point;
    // what we assert is narrower and robust: mutating `b` must not cause
    // `clean` to recompute (clean never reads b).
    expect(syncComputeCalls).toBe(cleanRendersBefore);

    // Document whether weird picked up b as a dependency at all.
    // (Not asserted strictly pass/fail — logged for the report.)
    // eslint-disable-next-line no-console
    console.log('asyncComputeCalls', asyncComputeCalls);
  });

  it('two derives where evaluation of derive A is interrupted by a microtask that runs derive B synchronously (via a getter side effect on state read)', () => {
    // This test constructs true reentrancy without needing async timers:
    // reading state `trigger` inside derive A's compute synchronously forces
    // recomputation of an unrelated derive B (by calling B's getter function
    // directly from inside a "read"). We use a plain object getter trick:
    // state() itself can't do this, so we simulate via calling deriveB()
    // directly inside deriveA's compute, both owned by the same instance.
    let trigger!: ReturnType<typeof state<number>>;
    let other!: ReturnType<typeof state<number>>;

    const results: { aSources: string[]; bSources: string[] } = {
      aSources: [],
      bSources: [],
    };

    const Component = () => {
      trigger = state(1);
      other = state(10);

      const bRef: { current: (() => number) | null } = { current: null };

      const b = derive(() => {
        // b depends only on `other`
        return other();
      });
      bRef.current = b;

      const a = derive(() => {
        // a reads trigger, then re-enters by reading b() (which is already
        // computed/cached, but exercises whether currentDerivedSubscriber is
        // correctly restored to `a`'s cell after b's read completes).
        const t = trigger();
        const bv = b();
        return t + bv;
      });

      return <div>{a()}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('11');

    // Mutate `other` -> b changes -> a should recompute (a depends on b).
    other.set(20);
    flushScheduler();
    expect(container.textContent).toBe('21');

    // Mutate `trigger` -> a should recompute directly.
    trigger.set(5);
    flushScheduler();
    expect(container.textContent).toBe('25');
  });
});
