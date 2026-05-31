import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { resource } from '../../../src/runtime/operations';
import { navigate } from '../../../src/router/navigate';
import {
  clearRoutes,
  getManifest,
  group,
  route,
} from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createControlledDeferred, settleAsyncWork } from './helpers';

describe('history resource race app flow', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    clearRoutes();
    window.history.replaceState({ path: '/a' }, '', '/a');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    clearRoutes();
    window.history.replaceState({}, '', '/');
  });

  it('should keep a pending route resource inert after history restores the previous page', async () => {
    const requests = {
      a: [
        createControlledDeferred<string>(),
        createControlledDeferred<string>(),
      ],
      b: [createControlledDeferred<string>()],
    };
    const starts: string[] = [];
    const signals: Record<string, AbortSignal[]> = { a: [], b: [] };

    function makePage(page: 'a' | 'b') {
      return function ResourcePage() {
        const index = signals[page].length;
        const result = resource<string>(({ signal }) => {
          starts.push(page);
          signals[page].push(signal);
          return requests[page][index].promise;
        });

        return (
          <section aria-label={`Page ${page.toUpperCase()}`}>
            {result.value ?? `Loading ${page.toUpperCase()}...`}
          </section>
        );
      };
    }

    function AppShell({ children }: { children?: unknown }) {
      return (
        <main aria-label="History shell">
          <header>History demo</header>
          {children as never}
        </main>
      );
    }

    group({ layout: AppShell }, () => {
      route('/a', makePage('a'));
      route('/b', makePage('b'));
    });

    await createSPA({ root: container, manifest: getManifest() });
    flushScheduler();

    const shell = container.querySelector('[aria-label="History shell"]');
    expect(starts).toEqual(['a']);

    requests.a[0].resolve('A initial');
    await settleAsyncWork();
    expect(container.textContent).toContain('A initial');

    navigate('/b');
    flushScheduler();

    expect(starts).toEqual(['a', 'b']);
    expect(signals.a[0].aborted).toBe(true);
    expect(container.textContent).toContain('Loading B...');

    window.history.pushState({ path: '/a' }, '', '/a');
    window.dispatchEvent(
      new PopStateEvent('popstate', {
        state: { path: '/a' },
      })
    );
    await settleAsyncWork();

    expect(container.querySelector('[aria-label="History shell"]')).toBe(shell);
    expect(starts).toEqual(['a', 'b', 'a']);
    expect(signals.b[0].aborted).toBe(true);
    expect(window.location.pathname).toBe('/a');
    expect(container.textContent).toContain('Loading A...');

    requests.a[1].resolve('A restored');
    await settleAsyncWork();
    expect(container.textContent).toContain('A restored');

    requests.b[0].resolve('B stale');
    await settleAsyncWork();

    expect(container.textContent).toContain('A restored');
    expect(container.textContent).not.toContain('B stale');
  });
});
