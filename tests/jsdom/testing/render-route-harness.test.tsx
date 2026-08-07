import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { currentRoute, createRouteRegistry, route } from '@askrjs/askr/router';
import { createQuery, queryScope } from '@askrjs/askr/data';
import { createQueryTestRegistry, queryState } from '@askrjs/askr/testing';
import { renderRoute, type RenderResult } from '@askrjs/askr/testing';

let mounted: RenderResult | undefined;

afterEach(() => {
  mounted?.cleanup();
  mounted = undefined;
});

describe('testing routed render harness', () => {
  it('should fail clearly without a browser-like window', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <h1>{'home'}</h1>);
    });
    const currentWindow = globalThis.window;
    vi.stubGlobal('window', undefined);

    await expect(renderRoute({ registry })).rejects.toThrow(
      '@askrjs/askr/testing renderRoute requires a browser-like DOM environment'
    );

    vi.stubGlobal('window', currentWindow);
    vi.unstubAllGlobals();
  });

  it('should render with the production router context', async () => {
    const registry = createRouteRegistry(() => {
      route('/teams/{team}', () => {
        const snapshot = currentRoute();
        return <h1>{snapshot.params.team}</h1>;
      });
    });

    mounted = await renderRoute({
      registry,
      url: '/teams/platform',
    });

    expect(mounted.container.textContent).toBe('platform');
  });

  it('should use an injected test runtime for routed query fixtures', async () => {
    const queries = queryScope('teams');
    const testRegistry = createQueryTestRegistry();
    testRegistry.set(
      queries.key('platform'),
      queryState.fresh({ name: 'Platform' })
    );
    const registry = createRouteRegistry(() => {
      route('/teams/{team}', ({ team }) => {
        const query = createQuery(
          {
            key: (input: { team: string }) => queries.key(input.team),
            fetch: async () => ({ name: 'network' }),
          },
          { team }
        );
        return <h1>{query.data?.name}</h1>;
      });
    });

    mounted = await renderRoute({
      registry,
      url: '/teams/platform',
      dataRuntime: testRegistry.runtime,
    });

    expect(mounted.container.textContent).toBe('Platform');
  });
});
