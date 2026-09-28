import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, hydrateSPA } from '../../../src/boot';
import { ErrorBoundary } from '../../../src/components';
import { navigate } from '../../../src/router';
import { resource } from '../../../src/resources';
import { renderToString } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('deferred resource hydration data', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('should retain a preloaded resource value until a below-fold boundary activates', async () => {
    let clientLoaderCalls = 0;

    function DeferredPanel() {
      const profile = resource(() => {
        clientLoaderCalls += 1;
        return 'client value';
      }, ['profile']);
      const settings = resource(() => {
        clientLoaderCalls += 1;
        return 'client settings';
      }, ['settings']);
      return (
        <>
          <p>{profile.value}</p>
          <p>{settings.value}</p>
          <NestedDeferredPanel />
        </>
      );
    }

    function NestedDeferredPanel() {
      const preferences = resource(() => {
        clientLoaderCalls += 1;
        return 'client preferences';
      }, ['preferences']);
      return <p>{preferences.value}</p>;
    }

    function AboveFoldPanel() {
      const aboveFold = resource(() => 'client above-fold value', ['above']);
      return <p class="above-fold">{aboveFold.value}</p>;
    }

    function HeaderPanel() {
      const header = resource(() => 'client header', ['header']);
      return <p>{header.value}</p>;
    }

    function Page() {
      return (
        <main>
          <HeaderPanel />
          <section class="below-fold">
            <DeferredPanel />
          </section>
          <AboveFoldPanel />
        </main>
      );
    }

    const routes = [
      {
        path: '/',
        handler: Page,
      },
    ];
    container.innerHTML = renderToString({
      url: '/',
      registry: routeRegistryFromTable(routes),
      data: {
        'r:0': 'server header',
        'r:1': 'server value',
        'r:2': 'server settings',
        'r:3': 'server preferences',
        'r:4': 'server above-fold value',
      },
    });

    const boundary = container.querySelector('.below-fold')!;
    const firstResourceMarker = Array.from(boundary.childNodes).find(
      (node) =>
        node.nodeType === Node.COMMENT_NODE &&
        (node as Comment).data.startsWith('askr-resource:')
    )!;
    boundary.insertBefore(
      document.createComment('unrelated-hydration-marker'),
      firstResourceMarker
    );
    let top = 1000;
    boundary.getBoundingClientRect = () => ({ top }) as DOMRect;
    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable(routes),
      hydrate: { deferBelowFold: true, foldThreshold: 100 },
    });

    expect(boundary.hasAttribute('data-skip-hydrate')).toBe(true);
    expect(clientLoaderCalls).toBe(0);
    expect(boundary.textContent).toBe(
      'server valueserver settingsserver preferences'
    );
    expect(container.querySelector('main')?.textContent).toContain(
      'server header'
    );
    expect(container.querySelector('.above-fold')?.textContent).toBe(
      'server above-fold value'
    );

    top = 0;
    window.dispatchEvent(new Event('scroll'));
    flushScheduler();
    await Promise.resolve();
    flushScheduler();

    expect(clientLoaderCalls).toBe(0);
    expect(boundary.textContent).toBe(
      'server valueserver settingsserver preferences'
    );
    expect(boundary.hasAttribute('data-skip-hydrate')).toBe(false);
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_COMMENT
    );
    const resourceMarkers: string[] = [];
    while (walker.nextNode()) {
      if ((walker.currentNode as Comment).data.startsWith('askr-resource:')) {
        resourceMarkers.push((walker.currentNode as Comment).data);
      }
    }
    expect(resourceMarkers).toEqual([]);
  });

  it('should preserve component slot identity when a deferred child hits an error boundary', async () => {
    let failOnClient = false;
    let clientLoaderCalls = 0;

    function DeferredPanel() {
      const profile = resource(() => {
        clientLoaderCalls += 1;
        return 'client value';
      }, ['profile']);
      if (failOnClient) throw new Error('client render failure');
      return <p>{profile.value}</p>;
    }

    function AboveFoldPanel() {
      const aboveFold = resource(() => 'client above-fold value', ['above']);
      return <p class="above-fold">{aboveFold.value}</p>;
    }

    function Page() {
      return (
        <main>
          <section class="below-fold">
            <ErrorBoundary fallback={<p>recovered</p>}>
              <DeferredPanel />
            </ErrorBoundary>
          </section>
          <AboveFoldPanel />
        </main>
      );
    }

    const routes = [{ path: '/', handler: Page }];
    container.innerHTML = renderToString({
      url: '/',
      registry: routeRegistryFromTable(routes),
      data: { 'r:0': 'server value', 'r:1': 'server above-fold value' },
    });
    const boundary = container.querySelector('.below-fold')!;
    boundary.getBoundingClientRect = () => ({ top: 1000 }) as DOMRect;
    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable(routes),
      hydrate: { deferBelowFold: true, foldThreshold: 100 },
    });
    failOnClient = true;

    expect(container.querySelector('.above-fold')?.textContent).toBe(
      'server above-fold value'
    );
    boundary.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    window.dispatchEvent(new Event('scroll'));
    flushScheduler();
    await Promise.resolve();
    flushScheduler();

    expect(boundary.textContent).toBe('recovered');
    expect(clientLoaderCalls).toBe(0);
  });

  it('should not seed a later route from the initial hydration resource payload', async () => {
    let nextRouteLoaderCalls = 0;

    function DeferredPanel() {
      const profile = resource(() => 'unused client value', ['profile']);
      return <p>{profile.value}</p>;
    }

    function InitialPage() {
      return (
        <section class="below-fold">
          <DeferredPanel />
        </section>
      );
    }

    function NextPage() {
      const value = resource(() => {
        nextRouteLoaderCalls += 1;
        return 'next route value';
      }, ['next']);
      return <p class="next-route">{value.value}</p>;
    }

    const routes = [
      { path: '/', handler: InitialPage },
      { path: '/next', handler: NextPage },
    ];
    const registry = routeRegistryFromTable(routes);
    container.innerHTML = renderToString({
      url: '/',
      registry,
      data: { 'r:0': 'initial route value' },
    });
    const boundary = container.querySelector('.below-fold')!;
    boundary.getBoundingClientRect = () => ({ top: 1000 }) as DOMRect;
    await hydrateSPA({
      root: container,
      registry,
      hydrate: { deferBelowFold: true, foldThreshold: 100 },
    });

    navigate('/next');
    await vi.waitFor(() => {
      expect(container.querySelector('.next-route')?.textContent).toBe(
        'next route value'
      );
    });
    expect(nextRouteLoaderCalls).toBe(1);
  });
});
