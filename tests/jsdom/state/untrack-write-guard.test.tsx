import { describe, it, expect, afterEach } from 'vite-plus/test';
import { derive, state, untrack } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * A derive() must stay pure. Wrapping a write in untrack() hides the read
 * from dependency tracking but not the fact that a derived computation is
 * running, so the write is still rejected.
 */
describe('writes inside untrack within a derive', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('should reject a state write hidden inside untrack() from a derive', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    let failure: unknown;
    createIsland({
      root: mounted.container,
      component: () => {
        const count = state(0);
        const other = state(0);
        const doubled = derive(() => {
          untrack(() => {
            try {
              other.set(1);
            } catch (error) {
              failure = error;
            }
          });
          return count() * 2;
        });
        return (
          <p>
            {doubled()}
            {other()}
          </p>
        );
      },
    });
    flushScheduler();
    expect(String(failure)).toMatch(/cannot be called inside a derive\(\)/);
  });
});
