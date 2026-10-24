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
import { createDataRuntime, disposeDataRuntime } from '../../../src/data';
import { navigate } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  group,
  layoutData,
  route,
  routeData,
} from '../../../src/router';
import type { RenderableChild } from '../../../src/common/vnode';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

describe('route loader cache in the browser', () => {
  let { container, cleanup } = createTestContainer();
  let dataRuntime = createDataRuntime();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    dataRuntime = createDataRuntime();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
  });

  afterEach(() => disposeDataRuntime(dataRuntime));

  it('should render cached data on a repeat visit, then swap in revalidated data', async () => {
    let version = 0;
    let release: (() => void) | undefined;
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/post', () => <p>{routeData<string>()}</p>, {
        loader: async () => {
          const current = `v${(version += 1)}`;
          if (version > 1) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          return current;
        },
      });
    });
    await createSPA({ root: container, registry, dataRuntime });

    navigate('/post');
    await vi.waitFor(() => expect(container.textContent).toBe('v1'));
    navigate('/');
    await vi.waitFor(() => expect(container.textContent).toBe('home'));

    navigate('/post');
    // The cached value renders while the loader is still pending.
    await vi.waitFor(() => expect(container.textContent).toBe('v1'));
    expect(version).toBe(2);
    release?.();
    await vi.waitFor(() => expect(container.textContent).toBe('v2'));
  });

  it('should render cached data on back navigation', async () => {
    let version = 0;
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/post', () => <p>{routeData<string>()}</p>, {
        loader: async () => `v${(version += 1)}`,
      });
    });
    await createSPA({ root: container, registry, dataRuntime });
    navigate('/post');
    await vi.waitFor(() => expect(container.textContent).toBe('v1'));
    navigate('/');
    await vi.waitFor(() => expect(container.textContent).toBe('home'));

    window.history.back();
    await vi.waitFor(() => expect(container.textContent).toMatch(/^v\d$/));
    await vi.waitFor(() => expect(container.textContent).toBe('v2'));
  });

  it('should give layouts group loader data through layoutData', async () => {
    const loadUser = async () => ({ name: 'Ada' });
    const registry = createRouteRegistry(() => {
      group(
        {
          loader: loadUser,
          layout: ({ children }: { children?: RenderableChild }) => (
            <div>
              <h1>{layoutData(loadUser).name}</h1>
              {children}
            </div>
          ),
        },
        () => {
          route('/', () => <p>home</p>);
          route('/page', () => <p>page {layoutData(loadUser).name}</p>, {
            loader: async () => 'leaf',
          });
        }
      );
    });
    await createSPA({ root: container, registry, dataRuntime });
    expect(container.querySelector('h1')?.textContent).toBe('Ada');

    navigate('/page');
    await vi.waitFor(() =>
      expect(container.querySelector('p')?.textContent).toBe('page Ada')
    );
    expect(container.querySelector('h1')?.textContent).toBe('Ada');
  });
});
