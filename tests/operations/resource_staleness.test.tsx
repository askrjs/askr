import { describe, it, expect } from 'vitest';
import { createIsland, resource } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test_renderer';
import type { JSXElement } from '../../src/jsx/types';

declare global {
  interface Window {
    _nextVal?: string;
    _nextDelay?: number;
    _nextToken?: number;
  }
}

describe('resource() stale result handling', () => {
  it('should discard stale async results (generation check)', async () => {
    // slow resolves after fast
    function delayed<T>(value: T, ms: number) {
      return new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
    }

    function App(): JSXElement {
      const r = resource(async () => {
        // value function uses a counter derived from an outer state, but we
        // simply flip values through refresh in test via clicks
        return await delayed(window._nextVal, window._nextDelay!);
      }, [window._nextToken]);

      return {
        type: 'div',
        props: {
          children: [r.value ?? 'loading'],
          onClick: () => {
            // trigger a refresh via setting globals and calling refresh
            r.refresh();
          },
        },
      };
    }

    const { container, cleanup } = createTestContainer();
    try {
      // Start with slow value
      window._nextVal = 'slow';
      window._nextDelay = 50;
      window._nextToken = 0;

      createIsland({ root: container, component: App });
      flushScheduler();
      await waitForNextEvaluation();
      flushScheduler();

      // Now trigger a refresh that will be fast
      window._nextVal = 'fast';
      window._nextDelay = 10;
      window._nextToken = 1;

      // Click to call refresh
      (container.firstChild as HTMLElement).click();

      // Wait enough for both to resolve
      await new Promise((resolve) => setTimeout(resolve, 70));
      await waitForNextEvaluation();
      flushScheduler();

      // The fast value should win
      expect(container.textContent).toBe('fast');
    } finally {
      cleanup();
    }
  });
});
