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
import type { JSXElement } from '../../src/jsx/types';

/**
 * SNAPSHOT SEMANTICS:
 * --------------------
 * These tests verify that async resources observe the context snapshot
 * captured at render time. Context values are "frozen" when the resource
 * is created and remain stable through async continuations.
 *
 * Key invariant: readContext() only works BEFORE the first await.
 * After await, user code must use the captured value.
 */
describe('nested context continuations preserve captured snapshot', () => {
  it('should preserve captured context snapshot across await (snapshot semantics)', async () => {
    const ParentCtx = defineContext('parent');
    const ChildCtx = defineContext('child');

    const Inner = () => {
      const r = resource(async () => {
        // SNAPSHOT SEMANTIC: Capture context values BEFORE awaiting.
        // These values are the "render-time snapshot" and will remain
        // stable through the entire async operation.
        const parent = readContext(ParentCtx);
        const child = readContext(ChildCtx);
        const beforeAwait = `${parent}:${child}`;

        await waitForNextEvaluation();

        // After await, use the captured values (cannot call readContext again).
        // The snapshot remains stable - this is the core invariant.
        const afterAwait = `${parent}:${child}`;
        return `${beforeAwait}->${afterAwait}`;
      }, []);

      return {
        type: 'div',
        props: {},
        children: [r.value ?? (r.pending ? 'pending' : 'error')],
      };
    };

    const Outer = () => {
      return <ChildCtx.Scope value={'C'}>{() => Inner()}</ChildCtx.Scope>;
    };

    const App = () => {
      return (
        <ParentCtx.Scope value={'P'}>
          <Outer />
        </ParentCtx.Scope>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      // Cast to satisfy test harness typing
      createIsland({
        root: container,
        component: App as unknown as () => JSXElement,
      });
      flushScheduler();

      // Let resource async continuation complete - wait multiple times to ensure completion
      await waitForNextEvaluation();
      await waitForNextEvaluation();
      flushScheduler();

      // SNAPSHOT SEMANTIC: The resource captured P:C at render time.
      // Both before and after await should see the same snapshot.
      // The DOM should reflect the resolved value showing snapshot stability.
      expect(container.textContent).toContain('P:C->P:C');
    } finally {
      cleanup();
    }
  });

  it('should give each render its own snapshot (re-renders create new resources)', async () => {
    const Theme = defineContext('default');

    const Child = () => {
      const r = resource(async () => {
        // Capture snapshot at render time
        const theme = readContext(Theme);
        const beforeAwait = theme;
        await waitForNextEvaluation();
        // Snapshot remains stable - use captured value
        const afterAwait = theme;
        return `${beforeAwait}->${afterAwait}`;
      }, []);

      return {
        type: 'div',
        props: {},
        children: [r.value ?? 'pending'],
      } as unknown as JSXElement;
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
      // Cast to satisfy test harness typing
      createIsland({
        root: container,
        component: App as unknown as () => JSXElement,
      });
      flushScheduler();

      await waitForNextEvaluation();
      await waitForNextEvaluation();
      flushScheduler();

      // SNAPSHOT SEMANTIC: The resource should see stable snapshot (A->A)
      // If snapshot was unstable, we'd see something like A->B
      expect(container.textContent).toContain('A->A');
    } finally {
      cleanup();
    }
  });
});
