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
import { createRouteRegistry, route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

async function settle() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
    flushScheduler();
  }
}

/**
 * A navigation that only changes the fragment stays on the current page: no
 * loader runs and the rendered content keeps its identity. A navigation to
 * the current location replaces the history entry instead of stacking a
 * duplicate.
 */
describe('hash-only and same-location navigation', () => {
  let { container, cleanup } = createTestContainer();
  let loads = 0;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    loads = 0;
    window.history.replaceState({}, '', '/docs');
  });
  afterEach(() => cleanup());

  function registry() {
    return createRouteRegistry(() => {
      route(
        '/docs',
        () => (
          <article>
            <h1>docs</h1>
            <p id="intro">intro</p>
          </article>
        ),
        {
          loader: async () => {
            loads += 1;
            return { ok: true };
          },
        }
      );
    });
  }

  it('should change only the fragment without rerunning the loader', async () => {
    await createSPA({ root: container, registry: registry() });
    await settle();
    const article = container.querySelector('article')!;
    expect(loads).toBe(1);
    const length = window.history.length;

    navigate('/docs#intro');
    await settle();

    expect(window.location.hash).toBe('#intro');
    expect(loads).toBe(1);
    expect(container.querySelector('article')).toBe(article);
    expect(window.history.length).toBe(length + 1);
  });

  it('should replace the history entry when navigating to the current location', async () => {
    await createSPA({ root: container, registry: registry() });
    await settle();
    const length = window.history.length;

    navigate('/docs');
    await settle();

    expect(window.location.pathname).toBe('/docs');
    expect(window.history.length).toBe(length);
  });
});
