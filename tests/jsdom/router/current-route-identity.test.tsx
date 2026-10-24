import { resetRouteState } from '../../router-test-utils';
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
import {
  createRouteRegistry,
  currentRoute,
  route,
  type RouteSnapshot,
} from '../../../src/router/route';
import { state, type State } from '../../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

/**
 * `currentRoute()` returns one snapshot object per committed location, so a
 * component can compare it by identity and does not pay for a fresh match
 * and a new frozen object on every read.
 */
describe('currentRoute() identity', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/a');
  });
  afterEach(() => cleanup());

  it('should return the same snapshot for repeated reads of one location', async () => {
    const seen: RouteSnapshot[] = [];
    let tick!: State<number>;
    const registry = createRouteRegistry(() => {
      route('/a', () => {
        const count = state(0);
        tick = count;
        seen.push(currentRoute(), currentRoute());
        return <p>{count()}</p>;
      });
      route('/b', () => {
        seen.push(currentRoute());
        return <p>b</p>;
      });
    });
    await createSPA({ root: container, registry });
    const first = seen[0];
    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen.every((snapshot) => snapshot === first)).toBe(true);

    const before = seen.length;
    tick.set(1);
    flushScheduler();
    expect(seen.length).toBeGreaterThan(before);
    expect(seen.slice(before).every((snapshot) => snapshot === first)).toBe(
      true
    );

    const beforeNavigation = seen.length;
    navigate('/b');
    await vi.waitFor(() => expect(container.textContent).toBe('b'));
    const next = seen[beforeNavigation];
    expect(next).not.toBe(first);
    expect(next.path).toBe('/b');
  });
});
