import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { action, defineAction } from '../../../src/actions';
import { cleanupApp, hydrateSPA } from '../../../src/boot';
import { navigate } from '../../../src/router';
import { schema } from '@askrjs/schema';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createPageRenderEnvelope } from '../../../src/common/page-render-envelope';

const save = defineAction({
  id: 'save-item',
  input: schema.object({ name: schema.string() }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hydrated action CSRF', () => {
  it('should retain the token for actions reached by client navigation', async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            version: 1,
            ok: true,
            result: { saved: true },
          }),
          { headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', request);
    let command!: ReturnType<
      typeof action<{ name: string }, { saved: boolean }>
    >;
    const Home = () => <p>home</p>;
    const ActionPage = () => {
      command = action<{ name: string }, { saved: boolean }>(save);
      return <p>{command.state().pending ? 'pending' : 'action'}</p>;
    };
    const routes = [
      { path: '/', handler: Home },
      { path: '/action', handler: ActionPage },
    ];
    const { container, cleanup } = createTestContainer();
    window.history.replaceState({}, '', '/');
    try {
      container.innerHTML = renderToStringSync(
        Home,
        {},
        {
          envelope: createPageRenderEnvelope({
            framework: { csrf: 'hydrated-token' },
          }),
        }
      );
      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      navigate('/action');
      flushScheduler();
      await command.submit({ name: 'Ada' });
      const headers = new Headers(request.mock.calls[0]?.[1]?.headers);
      expect(headers.get('x-askr-csrf-token')).toBe('hydrated-token');
    } finally {
      cleanupApp(container);
      cleanup();
    }
  });
});
