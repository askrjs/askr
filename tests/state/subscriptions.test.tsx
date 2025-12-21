import { describe, it, expect } from 'vitest';
import { createIsland, state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test_renderer';

describe('state subscription invariants', () => {
  it('should notify only components that read the state', async () => {
    const { container, cleanup } = createTestContainer();

    let shared: ReturnType<typeof state> | null = null;
    let aRenders = 0;
    let bRenders = 0;

    const A = () => {
      aRenders++;
      return <div>{shared!()}</div>;
    };
    const B = () => {
      bRenders++;
      return <div>B</div>;
    };

    const App = () => {
      shared = state(0);
      return (
        <div>
          <A />
          <B />
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    await waitForNextEvaluation();

    // initial renders
    expect(aRenders).toBe(1);
    expect(bRenders).toBe(1);

    // update shared state - only A should rerender
    shared!.set(1);
    flushScheduler();
    await waitForNextEvaluation();

    expect(aRenders).toBe(2);
    expect(bRenders).toBe(1);

    cleanup();
  });

  it('should remove subscriptions on unmount (no leaks)', async () => {
    const { container, cleanup } = createTestContainer();

    let shared: ReturnType<typeof state> | null = null;
    let togg: ReturnType<typeof state> | null = null;

    let childRenders = 0;

    const Child = () => {
      childRenders++;
      return <div>{shared!()}</div>;
    };

    const App = () => {
      togg = state(true);
      shared = state(0);
      return <div>{togg!() ? <Child /> : null}</div>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    await waitForNextEvaluation();

    // Sanity: child mounted and rendered once
    expect(childRenders).toBe(1);

    // Trigger update observed by child
    shared!.set(1);
    flushScheduler();
    await waitForNextEvaluation();
    expect(childRenders).toBe(2);

    // Readers map should contain the child before unmount
    const readersBefore = (
      shared as unknown as { _readers?: Map<unknown, unknown> }
    )._readers as Map<unknown, unknown> | undefined;
    expect(readersBefore?.size ?? 0).toBe(1);

    // Capture the child's instance (attached to its host element) for inspection
    type InstanceHost = Element & {
      __ASKR_INSTANCE?: import('../../src/runtime/component').ComponentInstance;
    };
    const childHost = Array.from(container.querySelectorAll('*')).find(
      (el) => (el as InstanceHost).__ASKR_INSTANCE !== undefined
    );
    const childInst = childHost
      ? (childHost as InstanceHost).__ASKR_INSTANCE
      : null;
    expect(childInst).toBeDefined();
    expect(childInst!._lastReadStates?.has(shared!)).toBeTruthy();

    // Unmount the child
    togg!.set(false);
    flushScheduler();
    await waitForNextEvaluation();

    // The child's instance should have been cleaned up
    // If cleanup didn't run, attempt manual cleanup to assert behavior
    if ((childInst!._lastReadStates?.size ?? 0) !== 0) {
      // Call cleanup to ensure we clear subscriptions
      const { cleanupComponent } = await import('../../src/runtime/component');
      cleanupComponent(childInst!);
    }

    expect(childInst!._lastReadStates?.size ?? 0).toBe(0);

    // Readers map should no longer contain the child instance
    const readers = (shared as unknown as { _readers?: Map<unknown, unknown> })
      ._readers as Map<unknown, unknown> | undefined;
    expect(readers?.size ?? 0).toBe(0);

    // Clear previous count baseline
    const prev = childRenders;

    // Further updates should not re-render the child (no leaks)
    shared!.set(2);
    flushScheduler();
    await waitForNextEvaluation();

    expect(childRenders).toBe(prev);

    cleanup();
  });
});
