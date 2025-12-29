/**
 * tests/runtime/commit_rollback.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state } from '../../src/index';
import type { State } from '../../src/runtime/state';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('commit & rollback (RUNTIME)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should roll back completely when render fails', async () => {
    const ok = () => ({ type: 'div', children: ['ok'] });
    createIsland({ root: container, component: ok });
    flushScheduler();
    const stable = container.innerHTML;

    const bad = () => {
      throw new Error('render failed');
    };

    try {
      createIsland({ root: container, component: bad });
    } catch {
      // expected
    }
    flushScheduler();

    expect(container.innerHTML).toBe(stable);
  });

  it('should roll back to stable state when partial failures occur', async () => {
    let flipState: State<boolean>;
    const Component = () => {
      const flip = state(false);
      flipState = flip; // Capture for testing
      if (flip()) {
        // Throw during component execution, not during rendering
        throw new Error('boom');
      }
      return {
        type: 'div',
        children: [
          { type: 'span', children: ['A'] },
          { type: 'span', children: ['B'] },
          { type: 'span', children: ['C'] },
        ],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const stable = container.innerHTML;

    // Trigger re-render that will fail
    expect(() => {
      flipState.set(true);
      flushScheduler();
    }).toThrow('boom');

    expect(container.innerHTML).toBe(stable);
  });
});
