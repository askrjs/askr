import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanupApp, hydrateSPA } from '@askrjs/askr/boot';
import {
  createRouteRegistry,
  group,
  layoutData,
  route,
  routeData,
} from '@askrjs/askr/router';
import { renderRouteRequestToString } from '@askrjs/askr/ssr';
import { navigate } from '../../../src/router/navigate';
import { createDataRuntime, disposeDataRuntime } from '../../../src/data';
import type { RenderableChild } from '../../../src/common/vnode';
import { resetRouteState } from '../../router-test-utils';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

afterEach(resetRouteState);

async function hydrateFirstPage(staleTimeMs: number | undefined) {
  const calls = { leaf: 0, layout: 0 };
  let total = 0;
  const layoutLoader = async () => {
    calls.layout += 1;
    return 'nav';
  };
  const registry = createRouteRegistry(() => {
    route('/', () => <p>home</p>);
    group(
      {
        loader: layoutLoader,
        staleTimeMs,
        layout: ({ children }: { children?: RenderableChild }) => (
          <div>
            <h1>{layoutData(layoutLoader)}</h1>
            {children}
          </div>
        ),
      },
      () => {
        route('/post', () => <p>{routeData<string>()}</p>, {
          loader: async () => {
            calls.leaf += 1;
            total += 1;
            return `leaf${total}`;
          },
          staleTimeMs,
        });
      }
    );
  });
  const rendered = await renderRouteRequestToString({
    url: '/post',
    registry,
  });
  if (rendered.kind !== 'render') throw new Error('expected render');
  calls.leaf = 0;
  calls.layout = 0;
  const root = document.body.appendChild(document.createElement('div'));
  root.innerHTML = rendered.html;
  window.history.replaceState({}, '', '/post');
  const dataRuntime = createDataRuntime();
  await hydrateSPA({ root, registry, dataRuntime });
  return { calls, root, dataRuntime };
}

describe('loader cache seeded from hydrated data', () => {
  it('should not refetch the first page when navigating back within staleTimeMs', async () => {
    const { calls, root, dataRuntime } = await hydrateFirstPage(60_000);
    try {
      expect(root.textContent).toBe('navleaf1');
      navigate('/');
      await vi.waitFor(() => expect(root.textContent).toBe('home'));
      navigate('/post');
      await vi.waitFor(() => expect(root.textContent).toBe('navleaf1'));
      expect(calls).toEqual({ leaf: 0, layout: 0 });
    } finally {
      cleanupApp(root);
      root.remove();
      disposeDataRuntime(dataRuntime);
    }
  });

  it('should render the seeded data and revalidate once it is stale', async () => {
    const { calls, root, dataRuntime } = await hydrateFirstPage(0);
    try {
      navigate('/');
      await vi.waitFor(() => expect(root.textContent).toBe('home'));
      navigate('/post');
      await vi.waitFor(() => expect(root.textContent).toBe('navleaf1'));
      await vi.waitFor(() => expect(root.textContent).toBe('navleaf2'));
      expect(calls).toEqual({ leaf: 1, layout: 1 });
    } finally {
      cleanupApp(root);
      root.remove();
      disposeDataRuntime(dataRuntime);
    }
  });

  it('should not seed a leaf whose server data was reduced by dehydrate', async () => {
    let runs = 0;
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/post', () => <p>{routeData<{ shown: string }>().shown}</p>, {
        loader: async () => {
          runs += 1;
          return { shown: `v${runs}`, secret: 'x' };
        },
        dehydrate: (data: { shown: string }) => ({ shown: data.shown }),
        staleTimeMs: 60_000,
      });
    });
    const rendered = await renderRouteRequestToString({
      url: '/post',
      registry,
    });
    if (rendered.kind !== 'render') throw new Error('expected render');
    const root = document.body.appendChild(document.createElement('div'));
    root.innerHTML = rendered.html;
    window.history.replaceState({}, '', '/post');
    const dataRuntime = createDataRuntime();
    try {
      await hydrateSPA({ root, registry, dataRuntime });
      navigate('/');
      await vi.waitFor(() => expect(root.textContent).toBe('home'));
      navigate('/post');
      await vi.waitFor(() => expect(root.textContent).toBe('v2'));
    } finally {
      cleanupApp(root);
      root.remove();
      disposeDataRuntime(dataRuntime);
    }
  });
});
