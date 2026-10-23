import { describe, it, expect, afterEach } from 'vite-plus/test';
import { state, derive, type State, type Derived } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * The derive loop guard exists for a derive that keeps invalidating itself.
 * Reading a derive many times between flushes, as an event handler that
 * writes and reads in a loop does, is ordinary work and must not trip it.
 */
describe('derive reads between flushes', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('should allow more than fifty reads of a derive before the next flush', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    let count!: State<number>;
    let doubled!: Derived<number>;
    createIsland({
      root: mounted.container,
      component: () => {
        count = state(0);
        doubled = derive(() => count() * 2);
        return <p>{doubled()}</p>;
      },
    });
    flushScheduler();

    const seen: number[] = [];
    for (let index = 1; index <= 80; index += 1) {
      count.set(index);
      seen.push(doubled());
    }
    expect(seen[79]).toBe(160);
    flushScheduler();
    expect(mounted.container.textContent).toBe('160');
  });
});
