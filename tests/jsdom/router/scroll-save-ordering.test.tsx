import { resetRouteState, currentRouteRegistry } from '../../router-test-utils';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { navigate } from '../../../src/router/navigate';
import { route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * The departing page's scroll position must be read before its content is
 * replaced. Browsers clamp `scrollY` as soon as the document shrinks, so a
 * save taken after the DOM swap records the short destination's position
 * instead of the long page's.
 */
describe('scroll position save ordering', () => {
  let { container, cleanup } = createTestContainer();
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
    scrollToSpy = vi.fn();
    for (const [name, value] of [
      ['scrollTo', scrollToSpy],
      ['scrollX', 0],
      ['scrollY', 0],
    ] as const) {
      Object.defineProperty(window, name, {
        value,
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => cleanup());

  it('should save the departing page scroll position before the DOM swap', async () => {
    route('/tall', () => <div style={{ height: '5000px' }}>tall</div>);
    route('/short', () => (
      // The browser clamps the scroll offset when the shorter page replaces
      // the tall one; the ref runs as soon as the new content is committed.
      <div
        ref={() => {
          window.scrollY = 0;
        }}
      >
        short
      </div>
    ));

    window.history.replaceState({ path: '/tall' }, '', '/tall');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    window.scrollY = 1000;
    navigate('/short');
    flushScheduler();
    expect(container.textContent).toBe('short');

    scrollToSpy.mockClear();
    window.history.pushState({ path: '/tall' }, '', '/tall');
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: { path: '/tall' } })
    );
    flushScheduler();

    expect(scrollToSpy).toHaveBeenCalledWith(0, 1000);
  });
});
