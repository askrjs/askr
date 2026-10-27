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
import { createRouteRegistry, lazy, route } from '../../../src/router/route';
import { loadDocument } from '../../../src/router/document-navigation';
import { logger } from '../../../src/common/logger';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

const MARKER = 'askr:stale-deployment-reload';

function staleChunkError(): TypeError {
  return new TypeError(
    'Failed to fetch dynamically imported module: https://app.test/assets/page-abc.js'
  );
}

describe('lazy chunk failures during navigation', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
    sessionStorage.removeItem(MARKER);
    vi.mocked(loadDocument).mockClear();
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    sessionStorage.removeItem(MARKER);
    vi.restoreAllMocks();
  });

  it('should render the route error component when the chunk fails to load', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route(
        '/lazy',
        lazy(async () => {
          throw new Error('chunk unavailable');
        }),
        {
          error: ({ error }) => <p>failed: {(error as Error).message}</p>,
        }
      );
    });
    await createSPA({ root: container, registry });

    navigate('/lazy');
    await vi.waitFor(() =>
      expect(container.textContent).toBe('failed: chunk unavailable')
    );
    expect(window.location.pathname).toBe('/lazy');
    expect(loadDocument).not.toHaveBeenCalled();
  });

  it('should reload the destination once when the failure looks like a stale deployment', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route(
        '/lazy',
        lazy(async () => {
          throw staleChunkError();
        }),
        { error: () => <p>error shown</p> }
      );
    });
    await createSPA({ root: container, registry });

    navigate('/lazy');
    await vi.waitFor(() => expect(loadDocument).toHaveBeenCalledTimes(1));
    expect(vi.mocked(loadDocument).mock.calls[0]![0]).toBe(
      `${window.location.origin}/lazy`
    );
    expect(sessionStorage.getItem(MARKER)).not.toBeNull();
    await vi.waitFor(() => expect(container.textContent).toBe('error shown'));

    // The reloaded document fails the same way: no loop, the error shows.
    navigate('/');
    await vi.waitFor(() => expect(container.textContent).toBe('home'));
    navigate('/lazy');
    await vi.waitFor(() => expect(container.textContent).toBe('error shown'));
    expect(loadDocument).toHaveBeenCalledTimes(1);
  });

  it('should reload even when the route declares no error component', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route(
        '/lazy',
        lazy(async () => {
          throw staleChunkError();
        })
      );
    });
    await createSPA({ root: container, registry });
    navigate('/lazy');
    await vi.waitFor(() => expect(loadDocument).toHaveBeenCalledTimes(1));
    expect(container.textContent).toBe('home');
  });

  it('should not reload for other failures', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route(
        '/lazy',
        lazy(async () => {
          throw new TypeError('x is not a function');
        })
      );
    });
    await createSPA({ root: container, registry });
    navigate('/lazy');
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
    expect(loadDocument).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it('should forget the marker once a chunk loads', async () => {
    sessionStorage.setItem(MARKER, '1');
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route(
        '/lazy',
        lazy(async () => ({ default: () => <p>lazy page</p> }))
      );
    });
    await createSPA({ root: container, registry });
    navigate('/lazy');
    await vi.waitFor(() => expect(container.textContent).toBe('lazy page'));
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it('should reload the current document when the initial route chunk is stale', async () => {
    window.history.replaceState({}, '', '/lazy');
    const registry = createRouteRegistry(() => {
      route(
        '/lazy',
        lazy(async () => {
          throw staleChunkError();
        })
      );
    });
    await expect(createSPA({ root: container, registry })).rejects.toThrow();
    expect(loadDocument).toHaveBeenCalledWith(
      `${window.location.origin}/lazy`,
      'replace'
    );
  });
});
