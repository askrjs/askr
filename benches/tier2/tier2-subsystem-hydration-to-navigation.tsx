import { bench, describe, expect } from 'vite-plus/test';
import { createHydrationFixture, tier2BenchOptions } from '../shared/_shared';
import { hydrateSPA } from '../../src/boot';
import { navigate } from '../../src/router/navigate';
import { createRouteRegistry, group, route } from '../../src/router';
import { flushScheduler } from '../../test-utils/render/test-renderer';

function createHydrationNavigationHarness() {
  const Layout = ({ children }: { children?: unknown }) => (
    <section class="shell">
      <header>Bench Shell</header>
      {children as never}
    </section>
  );
  const routes = [
    {
      path: '/dashboard',
      handler: () => <main class="page">Dashboard</main>,
    },
    {
      path: '/reports/{id}',
      handler: (params: Record<string, string>) => (
        <main class="page">Report {params.id}</main>
      ),
    },
  ];

  const registry = createRouteRegistry(() => {
    group({ layout: Layout }, () => {
      for (const entry of routes) route(entry.path, entry.handler);
    });
  });
  return { routes, registry };
}

await (async () => {
  const harness = createHydrationNavigationHarness();
  const fixture = createHydrationFixture({
    routes: harness.routes,
    registry: harness.registry,
    url: '/dashboard',
  });

  try {
    await expect(
      hydrateSPA({ root: fixture.container, registry: fixture!.registry })
    ).resolves.not.toThrow();
    flushScheduler();

    const shell = fixture.container.querySelector('.shell');
    await navigate('/reports/42');
    flushScheduler();

    expect(fixture.container.querySelector('.shell')).toBe(shell);
    expect(fixture.container.querySelector('.page')?.textContent).toBe(
      'Report 42'
    );
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration to navigation', () => {
  let harness: ReturnType<typeof createHydrationNavigationHarness> | null =
    null;
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'hydrate and immediately navigate to a sibling route',
    async () => {
      fixture!.reset();
      await hydrateSPA({
        root: fixture!.container,
        registry: fixture!.registry,
      });
      flushScheduler();
      await navigate('/reports/42');
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        harness = createHydrationNavigationHarness();
        fixture = createHydrationFixture({
          routes: harness.routes,
          registry: harness.registry,
          url: '/dashboard',
        });
      },
      teardown() {
        fixture?.cleanup();
        fixture = null;
        harness = null;
      },
    }
  );
});
