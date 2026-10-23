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
import { navigate, updateRouteQuery } from '../../../src/router/navigate';
import { navigationState } from '../../../src/router';
import { createRouteRegistry, route } from '../../../src/router/route';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

describe('updateRouteQuery during a pending navigation', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => cleanup());

  it('should supersede the pending navigation so it cannot publish over the query update', async () => {
    let release!: (value: string) => void;
    const slow = new Promise<string>((resolve) => {
      release = resolve;
    });
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/slow', () => <p>slow</p>, { loader: () => slow });
    });
    await createSPA({ root: container, registry });

    navigate('/slow');
    await vi.waitFor(() => expect(navigationState().pending).toBe(true));

    updateRouteQuery({ q: '1' });
    expect(window.location.pathname + window.location.search).toBe('/?q=1');
    expect(navigationState().pending).toBe(false);

    release('data');
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
    expect(container.textContent).toBe('home');
    expect(window.location.pathname + window.location.search).toBe('/?q=1');
  });
});
