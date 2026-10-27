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
import { renderToString } from '@askrjs/askr/ssr';
import {
  createRouteRegistry,
  currentRoute,
  isRoutePathActive,
  route,
} from '../../../src/router/route';
import { syncCurrentRouteSnapshot } from '../../../src/router/activity';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

describe('route activity under caseSensitive false and trailingSlash', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/about');
  });
  afterEach(() => cleanup());

  const Probe = () => (
    <p>
      {[
        isRoutePathActive('/About'),
        isRoutePathActive('/ABOUT/'),
        isRoutePathActive('/other'),
        currentRoute()
          .matches.map((match) => match.path)
          .join(','),
        JSON.stringify(currentRoute().params),
      ].join('|')}
    </p>
  );

  const insensitive = () =>
    createRouteRegistry(
      () => {
        route('/', () => <p>home</p>);
        route('/about', () => <Probe />);
        route('/users/{Name}', () => <Probe />);
      },
      { caseSensitive: false, trailingSlash: 'never' }
    );

  it('should treat candidate paths case-insensitively when the registry is', async () => {
    await createSPA({ root: container, registry: insensitive() });
    expect(container.textContent).toBe('true|true|false|/about|{}');
  });

  it('should match the location the way resolution canonicalizes it', async () => {
    await createSPA({ root: container, registry: insensitive() });
    window.history.replaceState({}, '', '/USERS/Ada/');
    syncCurrentRouteSnapshot('/USERS/Ada/', '', '');
    flushScheduler();
    await vi.waitFor(() =>
      expect(container.textContent).toContain('/users/{Name}')
    );
    expect(container.textContent).toContain('{"Name":"Ada"}');
  });

  it('should keep exact comparison for a default registry', async () => {
    await createSPA({
      root: container,
      registry: createRouteRegistry(() => {
        route('/about', () => <Probe />);
      }),
    });
    expect(container.textContent).toBe('false|false|false|/about|{}');
  });

  it('should report the canonical redirect for a differently cased synchronous server render', () => {
    expect(() =>
      renderToString({ url: '/ABOUT', registry: insensitive() })
    ).toThrow(/redirect/i);
  });
});
