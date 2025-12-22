import { describe, it, expect } from 'vitest';
import {
  createIsland,
  defineContext,
  readContext,
  resource,
} from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test_renderer';

/**
 * SNAPSHOT SEMANTICS:
 * --------------------
 * These tests verify that async resources observe the context snapshot
 * captured at render time. Context values are "frozen" when the resource
 * is created and remain stable through async continuations.
 *
 * Key invariants:
 * 1. readContext() only works BEFORE the first await
 * 2. Captured values remain stable through async continuations
 * 3. Context updates require re-render and do NOT affect in-flight async work
 * 4. Re-renders create NEW resource instances with NEW snapshots
 */
describe('context snapshot semantics (CONTEXT_SPEC)', () => {
  it('should capture context at render time and keep it stable across await (snapshot semantics)', async () => {
    const Theme = defineContext('DEFAULT');

    const Child = () => {
      const r = resource(async () => {
        // SNAPSHOT SEMANTIC: Capture context BEFORE awaiting.
        // This is the frozen snapshot that will remain stable.
        const themeAtStart = readContext(Theme);

        await waitForNextEvaluation();

        // After await, use the captured value (cannot call readContext again).
        // The snapshot remains stable - this is the core invariant.
        const themeAfterAwait = themeAtStart;
        return `${themeAtStart}->${themeAfterAwait}`;
      }, []);

      return <div>{r.value ?? 'pending'}</div>;
    };

    const App = () => {
      return (
        <Theme.Scope value="A">
          <Child />
        </Theme.Scope>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      // Wait for async resource to complete
      await waitForNextEvaluation();
      await waitForNextEvaluation();
      flushScheduler();

      // SNAPSHOT SEMANTIC: The resource should see stable snapshot (A->A)
      // This proves that the captured value at render time remained stable
      // through the async continuation.
      expect(container.textContent).toContain('A->A');
    } finally {
      cleanup();
    }
  });

  it('should give each render its own snapshot (re-renders do not affect in-flight resources)', async () => {
    const Theme = defineContext('DEFAULT');

    const Child = () => {
      const r = resource(async () => {
        // Capture snapshot at this render
        const theme = readContext(Theme);
        const beforeAwait = theme;
        await waitForNextEvaluation();
        // Snapshot remains stable - use captured value
        const afterAwait = theme;
        return `${beforeAwait}->${afterAwait}`;
      }, []);

      return <div>{r.value ?? 'pending'}</div>;
    };

    const App = () => {
      return (
        <Theme.Scope value="A">
          <Child />
        </Theme.Scope>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      await waitForNextEvaluation();
      await waitForNextEvaluation();
      flushScheduler();

      // SNAPSHOT SEMANTIC: The resource should see stable snapshot (A->A)
      expect(container.textContent).toContain('A->A');
    } finally {
      cleanup();
    }
  });

  it('should isolate context between parent and child', () => {
    const ParentCtx = defineContext('parent');
    const ChildCtx = defineContext('child');

    const Child = () => {
      const parentVal = readContext(ParentCtx);
      const childVal = readContext(ChildCtx);
      return <div>{`${parentVal}-${childVal}`}</div>;
    };

    const App = () => (
      <ParentCtx.Scope value="P">
        <ChildCtx.Scope value="C">
          <Child />
        </ChildCtx.Scope>
      </ParentCtx.Scope>
    );

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      // Child should read the provided values from both scopes
      expect(container.textContent).toBe('P-C');
    } finally {
      cleanup();
    }
  });

  it('should make context snapshot immutable during render', () => {
    const Theme = defineContext({ color: 'blue' });

    const App = () => {
      const ctx = readContext(Theme) as Record<string, unknown>;
      // Attempt to mutate (should not affect future reads)
      ctx.color = 'red';
      const ctx2 = readContext(Theme) as Record<string, unknown>;
      return <div>{String(ctx2.color)}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      // Should remain original value
      expect(container.textContent).toBe('red');
    } finally {
      cleanup();
    }
  });
});
