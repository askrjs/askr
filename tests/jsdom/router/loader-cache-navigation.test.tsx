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
import {
  createDataRuntime,
  disposeDataRuntime,
  invalidate,
} from '../../../src/data';
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

  it('should not publish a background revalidation after its route data is invalidated', async () => {
    let version = 0;
    let release!: () => void;
    let revalidationSettled = false;
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/post', () => <p>{routeData<string>()}</p>, {
        loader: async () => {
          const current = `v${(version += 1)}`;
          if (version > 1) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
            revalidationSettled = true;
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
    await vi.waitFor(() => expect(container.textContent).toBe('v1'));
    expect(version).toBe(2);

    invalidate('route-data:/post', { runtime: dataRuntime });
    release();
    await vi.waitFor(() => expect(revalidationSettled).toBe(true));
    for (let index = 0; index < 6; index += 1) await Promise.resolve();

    expect(container.textContent).toBe('v1');
  });

  it('should not publish revalidation data invalidated by a destination DOM callback', async () => {
    let version = 0;
    let release!: () => void;
    let invalidated = false;
    const tag = 'askr-route-invalidator';
    customElements.define(
      tag,
      class extends HTMLElement {
        connectedCallback() {
          if (!invalidated) {
            invalidated = true;
            invalidate('route-data:/post', { runtime: dataRuntime });
          }
        }
      }
    );
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route(
        '/post',
        () => {
          const value = routeData<string>();
          return (
            <>
              <p>{value}</p>
              {value === 'v2' && <askr-route-invalidator />}
            </>
          );
        },
        {
          loader: async () => {
            const current = `v${(version += 1)}`;
            if (version > 1) {
              await new Promise<void>((resolve) => {
                release = resolve;
              });
            }
            return current;
          },
        }
      );
    });
    await createSPA({ root: container, registry, dataRuntime });

    navigate('/post');
    await vi.waitFor(() => expect(container.textContent).toBe('v1'));
    navigate('/');
    await vi.waitFor(() => expect(container.textContent).toBe('home'));
    navigate('/post');
    await vi.waitFor(() => expect(container.textContent).toBe('v1'));
    expect(version).toBe(2);

    release();
    await vi.waitFor(() => expect(invalidated).toBe(true));
    for (let index = 0; index < 6; index++) await Promise.resolve();

    expect(container.textContent).toBe('v1');
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
