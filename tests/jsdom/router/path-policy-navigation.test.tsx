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
import { renderRouteRequestToString } from '@askrjs/askr/ssr';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, route } from '../../../src/router/route';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

describe('trailingSlash and caseSensitive in the browser and on the server', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => cleanup());

  const registry = () =>
    createRouteRegistry(
      () => {
        route('/', () => <p>home</p>);
        route('/about', () => <p>about</p>);
      },
      { trailingSlash: 'never', caseSensitive: false }
    );

  it('should land on the canonical URL after a client navigation to another form', async () => {
    await createSPA({ root: container, registry: registry() });
    const length = window.history.length;

    navigate('/About/?x=1');
    await vi.waitFor(() => expect(container.textContent).toBe('about'));
    expect(window.location.pathname + window.location.search).toBe(
      '/about?x=1'
    );
    // The redirect replaced the entry it would have pushed once.
    expect(window.history.length).toBe(length + 1);
  });

  it('should canonicalize the initial URL while booting', async () => {
    window.history.replaceState({}, '', '/ABOUT/');
    await createSPA({ root: container, registry: registry() });
    expect(container.textContent).toBe('about');
    expect(window.location.pathname).toBe('/about');
  });

  it('should return the canonical redirect for server rendering', async () => {
    const result = await renderRouteRequestToString({
      url: '/about/',
      registry: registry(),
    });
    expect(result).toMatchObject({
      kind: 'redirect',
      to: '/about',
      status: 308,
    });
  });
});
