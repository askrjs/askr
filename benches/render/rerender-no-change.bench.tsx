import { bench, describe, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';

describe('rerender no change', () => {
  describe('static component', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let triggerRerender: (() => void) | null = null;

    beforeEach(() => {
      const res = createTestContainer();
      container = res.container;
      cleanup = res.cleanup;

      const StaticComponent = () => {
        const renderCount = state(0);
        triggerRerender = () => renderCount.set(renderCount() + 1);

        return {
          type: 'div',
          children: [
            { type: 'h1', children: ['Static Title'] },
            { type: 'p', children: ['This content never changes'] },
          ],
        };
      };

      createIsland({ root: container, component: StaticComponent });
      flushScheduler();
      triggerRerender!();
      flushScheduler();
    });

    afterEach(() => {
      cleanup();
      triggerRerender = null;
    });

    bench('static component rerender', () => {
      triggerRerender!();
      flushScheduler();
    });
  });
});
