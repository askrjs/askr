import { afterEach, describe, expect, it } from 'vite-plus/test';
import { currentRoute, createRouteRegistry, route } from '@askrjs/askr/router';
import { renderRoute, type RenderResult } from '@askrjs/askr/testing';

let mounted: RenderResult | undefined;

afterEach(() => {
  mounted?.cleanup();
  mounted = undefined;
});

describe('testing routed render harness', () => {
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
});
