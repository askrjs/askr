import { bench, describe, expect } from 'vite-plus/test';
import {
  buildRows,
  buildTableHydrationRoutes,
  createHydrationFixture,
  extendBenchOptions,
  tier2BenchOptions,
} from '../shared/_shared';

const routes = buildTableHydrationRoutes(buildRows(1000));
const markerLookupBenchOptions = extendBenchOptions(tier2BenchOptions, {
  time: 1800,
  iterations: 5,
  warmupTime: 250,
  warmupIterations: 1,
});

function appendSkippedIslands(container: HTMLDivElement): void {
  container.insertAdjacentHTML(
    'beforeend',
    '<div class="static-footer"><button type="button">Static</button></div>' +
      '<div class="marketing-slot"><button type="button">Marketing</button></div>'
  );
}

await (async () => {
  const fixture = createHydrationFixture({
    routes,
    mutateServerHtml(container) {
      appendSkippedIslands(container);
    },
  });

  try {
    expect(
      fixture.container.querySelectorAll('.static-footer, .marketing-slot')
    ).toHaveLength(2);
  } finally {
    fixture.cleanup();
  }
})();

describe('tier2 subsystem hydration marker lookup', () => {
  let fixture: ReturnType<typeof createHydrationFixture> | null = null;
  let marked = false;

  bench(
    'toggle skipped hydration markers on a 1,000-row fixture',
    () => {
      const skipped = fixture!.container.querySelectorAll(
        '.static-footer, .marketing-slot'
      );

      marked = !marked;
      skipped.forEach((element) =>
        marked
          ? element.setAttribute('data-skip-hydrate', 'true')
          : element.removeAttribute('data-skip-hydrate')
      );
    },
    {
      ...markerLookupBenchOptions,
      setup() {
        fixture = createHydrationFixture({
          routes,
          mutateServerHtml(container) {
            appendSkippedIslands(container);
          },
        });
        marked = false;
      },
      teardown() {
        fixture?.cleanup();
        fixture = null;
      },
    }
  );
});
