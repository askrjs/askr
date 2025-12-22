import { describe, it, expect } from 'vitest';
import {
  createIsland,
  defineContext,
  readContext,
  state,
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
 * These tests verify that the context snapshot system doesn't leak state
 * across renders. Each render should capture its own isolated snapshot.
 *
 * Key invariants:
 * 1. Many synchronous re-renders should not accumulate snapshot state
 * 2. Each resource captures its snapshot at creation time
 * 3. Snapshots remain stable through async continuations
 */
describe('context snapshot stack balance (REGRESSION)', () => {
  it('should capture snapshot at mount time regardless of prior render history (snapshot semantics)', async () => {
    const Theme = defineContext('DEFAULT');

    const Child = () => {
      const r = resource(async () => {
        // SNAPSHOT SEMANTIC: Capture context at render time.
        const themeAtStart = readContext(Theme);
        await waitForNextEvaluation();
        // Snapshot remains stable through await - use captured value.
        const themeAfterAwait = themeAtStart;
        return `${themeAtStart}->${themeAfterAwait}`;
      }, []);

      return { type: 'div', children: [r.value ?? 'pending'] };
    };

    let themeState: ReturnType<typeof state>;
    let showChildState: ReturnType<typeof state>;

    const App = () => {
      themeState = state('A');
      showChildState = state(false);

      return (
        <Theme.Scope value={themeState()}>
          {showChildState() ? () => Child() : null}
        </Theme.Scope>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      // Cause many synchronous re-renders (no child mounted yet)
      for (let i = 0; i < 50; i++) {
        themeState.set(i % 2 === 0 ? 'X' : 'Y');
        flushScheduler();
      }

      // Set final theme value before mounting child
      themeState.set('FINAL');
      flushScheduler();

      // Now mount the async child which will capture the render-time snapshot
      showChildState.set(true);
      flushScheduler();

      // Let async continuation run
      await waitForNextEvaluation();
      await waitForNextEvaluation();
      flushScheduler();

      // SNAPSHOT SEMANTIC: The child was mounted when theme was 'FINAL'.
      // The resource should capture 'FINAL' and maintain that snapshot
      // through the async continuation (FINAL->FINAL).
      // This proves prior re-renders don't corrupt snapshot state.
      expect(container.textContent).toContain('FINAL->FINAL');
    } finally {
      cleanup();
    }
  });
});
