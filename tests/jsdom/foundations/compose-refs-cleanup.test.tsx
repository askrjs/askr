import { describe, it, expect, afterEach, vi } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { composeRefs } from '../../../src/foundations/utilities';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * A composed ref forwards each callback's returned cleanup: on detach the
 * cleanups run once and refs that returned none receive null, as they would
 * when attached directly.
 */
describe('composeRefs cleanup propagation', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('should run returned cleanups and null the others on detach', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    const released = vi.fn();
    const withCleanup = vi.fn(() => released);
    const plain = vi.fn();
    let show!: State<boolean>;
    createIsland({
      root: mounted.container,
      component: () => {
        const visible = state(true);
        show = visible;
        return visible() ? (
          <div ref={composeRefs<HTMLDivElement>(withCleanup, plain)} />
        ) : (
          <p>gone</p>
        );
      },
    });
    flushScheduler();
    const element = mounted.container.querySelector('div');
    expect(withCleanup).toHaveBeenCalledWith(element);
    expect(plain).toHaveBeenCalledWith(element);
    expect(released).not.toHaveBeenCalled();

    show.set(false);
    flushScheduler();
    expect(released).toHaveBeenCalledTimes(1);
    expect(withCleanup).toHaveBeenCalledTimes(1);
    expect(plain).toHaveBeenLastCalledWith(null);
  });
});
