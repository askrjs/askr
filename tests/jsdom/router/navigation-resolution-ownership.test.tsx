import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { createRouteRegistry, route } from '../../../src/router/route';
import { navigate } from '../../../src/router/navigate';
import { resetRouterState } from '../../../src/router/reset';
import {
  beginRouteRequest,
  resolveNavigationTargetsForApps,
  applyNavigationTargets,
} from '../../../src/router/navigation-targets';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve();
    flushScheduler();
  }
}

describe('navigation resolution ownership', () => {
  let view: ReturnType<typeof createTestContainer>;
  beforeEach(() => {
    resetRouterState();
    view = createTestContainer();
    window.history.replaceState({}, '', '/start');
  });
  afterEach(() => {
    cleanupApp(view.container);
    view.cleanup();
    resetRouterState();
    window.history.replaceState({}, '', '/');
    document.head
      .querySelectorAll('[data-askr-head]')
      .forEach((node) => node.remove());
  });

  it.each(['push', 'popstate'] as const)(
    'should preserve the destination and signal of navigation started by an abort listener during %s',
    async (mode) => {
      let slowSignal!: AbortSignal;
      let latestSignal!: AbortSignal;
      let latestLoads = 0;
      let interruptedLoads = 0;
      const registry = createRouteRegistry(() => {
        route('/start', () => <p>start</p>);
        route('/slow', () => <p>slow</p>, {
          loader: ({ signal }) => {
            slowSignal = signal;
            signal.addEventListener('abort', () => navigate('/latest'), {
              once: true,
            });
            return new Promise(() => {});
          },
        });
        route('/interrupted', () => <p>interrupted</p>, {
          loader: () => {
            interruptedLoads++;
            return null;
          },
        });
        route('/latest', () => <p>latest</p>, {
          loader: ({ signal }) => {
            latestLoads++;
            latestSignal = signal;
            return null;
          },
        });
        route('/last', () => <p>last</p>);
      });
      await createSPA({ root: view.container, registry });
      navigate('/slow');
      expect(slowSignal.aborted).toBe(false);
      if (mode === 'push') navigate('/interrupted');
      else {
        const state = { askrIndex: -1, path: '/interrupted' };
        window.history.replaceState(state, '', '/interrupted');
        window.dispatchEvent(new PopStateEvent('popstate', { state }));
      }
      await settle();
      expect(view.container.textContent).toBe('latest');
      expect(window.location.pathname).toBe('/latest');
      expect(slowSignal.aborted).toBe(true);
      expect(latestSignal.aborted).toBe(false);
      expect(latestLoads).toBe(1);
      expect(interruptedLoads).toBe(0);
      navigate('/last');
      await settle();
      expect(latestSignal.aborted).toBe(true);
      expect(view.container.textContent).toBe('last');
    }
  );

  it('should discard stale metadata resolution without publishing nodes, title or history', async () => {
    let release!: (value: { title: string }) => void;
    let metadataSignal!: AbortSignal;
    const pending = new Promise<{ title: string }>((resolve) => {
      release = resolve;
    });
    const registry = createRouteRegistry(() => {
      route('/start', () => <p>start</p>);
      route('/pending', () => <p>pending</p>, {
        meta: ({ signal }) => {
          metadataSignal = signal;
          return pending;
        },
      });
      route('/latest', () => <p>latest</p>, { meta: { title: 'Latest' } });
    });
    await createSPA({ root: view.container, registry });
    navigate('/pending');
    await settle();
    expect(view.container.textContent).toBe('start');
    navigate('/latest', { state: { latest: true } });
    await settle();
    const node = view.container.firstChild;
    const historyLength = window.history.length;
    expect(document.title).toBe('Latest');
    expect(metadataSignal.aborted).toBe(true);
    release({ title: 'Obsolete' });
    await settle();
    expect(view.container.firstChild).toBe(node);
    expect(view.container.textContent).toBe('latest');
    expect(document.title).toBe('Latest');
    expect(window.location.pathname).toBe('/latest');
    expect(window.history.length).toBe(historyLength);
    expect(window.history.state.askrState).toEqual({ latest: true });
  });

  it('should resolve every root without publication until the commit boundary is called', async () => {
    const other = createTestContainer();
    let release!: (value: string) => void;
    let loaderSignal!: AbortSignal;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const registry = createRouteRegistry(() => {
      route('/start', () => <p>start</p>);
      route('/pending', () => <p>ready</p>, {
        loader: ({ signal }) => {
          loaderSignal = signal;
          return pending;
        },
        meta: { title: 'Resolved' },
      });
    });
    const denied = createRouteRegistry(() => {
      route('/start', () => <p>other</p>);
      route('/pending', () => <p>unreachable</p>, {
        auth: () => ({ allowed: false, reason: 'forbidden' }),
      });
    });
    try {
      await createSPA({ root: view.container, registry });
      await createSPA({ root: other.container, registry: denied });
      const request = beginRouteRequest();
      const targets = resolveNavigationTargetsForApps(
        '/pending',
        '/pending',
        request.signal
      );
      expect(loaderSignal).toBe(request.signal);
      expect(view.container.textContent).toBe('start');
      expect(other.container.textContent).toBe('other');
      release('loaded');
      const resolved = await targets;
      expect(resolved).toHaveLength(2);
      expect(
        resolved.find((target) => target.app.registry === registry)?.metadata
      ).toEqual({ title: 'Resolved' });
      expect(
        resolved.find((target) => target.app.registry === denied)?.resolved
      ).toEqual({ kind: 'deny', status: 403 });
      expect(view.container.textContent).toBe('start');
      expect(other.container.textContent).toBe('other');
      expect(window.location.pathname).toBe('/start');
      applyNavigationTargets(
        request.id,
        '/pending',
        {},
        { redirects: 0, visited: new Set(['/pending']) },
        '/pending',
        '/pending',
        resolved,
        () => {
          throw new Error('unexpected redirect');
        }
      );
      await settle();
      expect(view.container.textContent).toBe('ready');
      expect(other.container.textContent).toBe('403');
      expect(window.location.pathname).toBe('/pending');
      expect(document.title).toBe('Resolved');
    } finally {
      cleanupApp(other.container);
      other.cleanup();
    }
  });
});
