import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createSPA, hydrateSPA } from '../../../src/boot';
import { createRouteRegistry, currentRoute, route } from '../../../src/router';
import {
  renderRouteRequestToString,
  renderToStringSync,
} from '../../../src/ssr';
import { getActiveRenderContext } from '../../../src/common/render-context';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('browser history state and server route snapshots', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
    window.history.replaceState({}, '', '/');
  });

  function retainBrowserState() {
    window.history.replaceState(
      { askrHasState: true, askrState: { owner: 'browser' } },
      '',
      '/'
    );
  }

  const StatePage = () => {
    const snapshot = currentRoute();
    return (
      <main>
        {JSON.stringify({ hasState: snapshot.hasState, state: snapshot.state })}
      </main>
    );
  };

  it('should omit browser history state from a low-level SSR snapshot', () => {
    retainBrowserState();

    expect(renderToStringSync(StatePage)).toBe(
      '<main>{"hasState":false}</main>'
    );
  });

  it('should omit browser history state from an isolated SSR request', async () => {
    retainBrowserState();
    const registry = createRouteRegistry(() => route('/', StatePage));

    const result = await renderRouteRequestToString({ url: '/', registry });

    expect(result).toMatchObject({
      kind: 'render',
      html: '<main>{"hasState":false}</main>',
    });
    expect(window.history.state.askrState).toEqual({ owner: 'browser' });
  });

  it('should preserve the owning browser entry state in SPA rendering', async () => {
    retainBrowserState();
    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    const registry = createRouteRegistry(() => route('/', StatePage));

    await createSPA({ root: container, registry });

    expect(container.textContent).toBe(
      '{"hasState":true,"state":{"owner":"browser"}}'
    );
  });

  it('should keep server verification isolated while hydration reads browser state', async () => {
    retainBrowserState();
    const observations: Array<{
      server: boolean;
      hasState: boolean;
      state: unknown;
    }> = [];
    const Page = () => {
      const snapshot = currentRoute();
      observations.push({
        server: getActiveRenderContext() !== null,
        hasState: snapshot.hasState,
        state: snapshot.state,
      });
      return <main>page</main>;
    };
    const registry = createRouteRegistry(() => route('/', Page));
    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    const result = await renderRouteRequestToString({ url: '/', registry });
    if (result.kind !== 'render') throw new Error('Expected a rendered route');
    container.innerHTML = result.html;

    await hydrateSPA({
      root: container,
      registry,
      hydrate: { verifyMarkup: true },
    });

    expect(observations.filter((entry) => entry.server)).not.toHaveLength(0);
    expect(observations.filter((entry) => entry.server)).toEqual(
      expect.arrayContaining([
        { server: true, hasState: false, state: undefined },
      ])
    );
    expect(
      observations
        .filter((entry) => entry.server)
        .every((entry) => !entry.hasState)
    ).toBe(true);
    expect(observations.filter((entry) => !entry.server)).toEqual(
      expect.arrayContaining([
        { server: false, hasState: true, state: { owner: 'browser' } },
      ])
    );
  });
});
