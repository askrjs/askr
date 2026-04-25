import { bench, describe, expect } from 'vite-plus/test';
import {
  createHydrationFixture,
  tier2BenchOptions,
} from '../../shared/_shared';
import { hydrateSPA } from '../../../src/boot';
import { navigate } from '../../../src/router/navigate';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

function createHydrationNavigationHarness() {
  const routes = [
    {
      path: '/dashboard',
      handler: () => (
        <section class="shell">
          <header>Bench Shell</header>
          <main class="page">Dashboard</main>
        </section>
      ),
    },
    {
      path: '/reports/{id}',
      handler: (params: Record<string, string>) => (
        <section class="shell">
          <header>Bench Shell</header>
          <main class="page">Report {params.id}</main>
        </section>
      ),
    },
  ];

  return { routes };
}

await (async () => {
  const harness = createHydrationNavigationHarness();
  const fixture = createHydrationFixture({
    routes: harness.routes,
    url: '/dashboard',
  });

  try {
    await expect(
      hydrateSPA({ root: fixture.container, routes: fixture.routes })
    ).resolves.not.toThrow();
    flushScheduler();

    const shell = fixture.container.querySelector('.shell');
    navigate('/reports/42');
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
      await hydrateSPA({ root: fixture!.container, routes: fixture!.routes });
      flushScheduler();
      navigate('/reports/42');
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        harness = createHydrationNavigationHarness();
        fixture = createHydrationFixture({
          routes: harness.routes,
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
