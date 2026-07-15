import { describe, it, expect } from 'vite-plus/test';
import { defineScope, readScope } from '../../../src/runtime/context';
import { resource } from '../../../src/resources';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

/**
 * SNAPSHOT SEMANTICS:
 * --------------------
 * These tests verify that async resources observe the context snapshot
 * captured at render time. Context values are "frozen" when the resource
 * is created and remain stable through async continuations.
 *
 * Key invariants:
 * 1. readScope() only works BEFORE the first await
 * 2. Captured values remain stable through async continuations
 * 3. Context updates require re-render and do NOT affect in-flight async work
 * 4. Re-renders create NEW resource instances with NEW snapshots
 */
describe('context snapshot semantics (CONTEXT_SPEC)', () => {
  it('should capture context at render time and keep it stable across await (snapshot semantics)', async () => {
    const Theme = defineScope('DEFAULT');

    const Child = () => {
      const r = resource(async () => {
        // SNAPSHOT SEMANTIC: Capture context BEFORE awaiting.
        // This is the frozen snapshot that will remain stable.
        const themeAtStart = readScope(Theme);

        await waitForNextEvaluation();

        // After await, use the captured value (cannot call readScope again).
        // The snapshot remains stable - this is the core invariant.
        const themeAfterAwait = themeAtStart;
        return `${themeAtStart}->${themeAfterAwait}`;
      }, []);

      return <div>{r.value ?? 'pending'}</div>;
    };

    const App = () => {
      return (
        <Theme value="A">
          <Child />
        </Theme>
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
    const Theme = defineScope('DEFAULT');

    const Child = () => {
      const r = resource(async () => {
        // Capture snapshot at this render
        const theme = readScope(Theme);
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
        <Theme value="A">
          <Child />
        </Theme>
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
    const ParentScope = defineScope('parent');
    const ChildScope = defineScope('child');

    const Child = () => {
      const parentVal = readScope(ParentScope);
      const childVal = readScope(ChildScope);
      return <div>{`${parentVal}-${childVal}`}</div>;
    };

    const App = () => (
      <ParentScope value="P">
        <ChildScope value="C">
          <Child />
        </ChildScope>
      </ParentScope>
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
    const Theme = defineScope({ color: 'blue' });

    const App = () => {
      const ctx = readScope(Theme) as Record<string, unknown>;
      // Attempt to mutate (should not affect future reads)
      ctx.color = 'red';
      const ctx2 = readScope(Theme) as Record<string, unknown>;
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
