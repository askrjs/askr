import { bench, describe, expect } from 'vitest';
import { createHydrationFixture, tier2BenchOptions } from './_shared';
import { hydrateSPA } from '../src/boot';

const mismatchRoutes = [
  {
    path: '/',
    handler: () => (
      <div class="mismatch-root">
        <section class="mismatch-body">
          <button id="mismatch-control" data-mode="expected">
            Ready
          </button>
        </section>
      </div>
    ),
  },
];

await (async () => {
  const extraChildFixture = createHydrationFixture({
    routes: mismatchRoutes,
    mutateServerHtml(container) {
      const extraNode = document.createElement('span');
      extraNode.textContent = 'Unexpected child';
      container.querySelector('.mismatch-body')?.appendChild(extraNode);
    },
  });

  try {
    await expect(
      hydrateSPA({
        root: extraChildFixture.container,
        routes: extraChildFixture.routes,
      })
    ).rejects.toThrow(/Hydration mismatch/i);
  } finally {
    extraChildFixture.cleanup();
  }

  const attributeFixture = createHydrationFixture({
    routes: mismatchRoutes,
    mutateServerHtml(container) {
      container
        .querySelector('#mismatch-control')
        ?.setAttribute('data-mode', 'drifted');
    },
  });

  try {
    await expect(
      hydrateSPA({
        root: attributeFixture.container,
        routes: attributeFixture.routes,
      })
    ).rejects.toThrow(/Hydration mismatch/i);
  } finally {
    attributeFixture.cleanup();
  }
})();

describe('tier2 subsystem hydration structural mismatch', () => {
  let extraChildFixture: ReturnType<typeof createHydrationFixture> | null = null;
  let attributeFixture: ReturnType<typeof createHydrationFixture> | null = null;

  bench(
    'reject hydration on one extra nested child',
    async () => {
      await hydrateSPA({
        root: extraChildFixture!.container,
        routes: extraChildFixture!.routes,
      }).catch(() => undefined);
    },
    {
      ...tier2BenchOptions,
      setup() {
        extraChildFixture = createHydrationFixture({
          routes: mismatchRoutes,
          mutateServerHtml(container) {
            const extraNode = document.createElement('span');
            extraNode.textContent = 'Unexpected child';
            container.querySelector('.mismatch-body')?.appendChild(extraNode);
          },
        });
      },
      teardown() {
        extraChildFixture?.cleanup();
        extraChildFixture = null;
      },
    }
  );

  bench(
    'reject hydration on attribute drift in a nested control',
    async () => {
      await hydrateSPA({
        root: attributeFixture!.container,
        routes: attributeFixture!.routes,
      }).catch(() => undefined);
    },
    {
      ...tier2BenchOptions,
      setup() {
        attributeFixture = createHydrationFixture({
          routes: mismatchRoutes,
          mutateServerHtml(container) {
            container
              .querySelector('#mismatch-control')
              ?.setAttribute('data-mode', 'drifted');
          },
        });
      },
      teardown() {
        attributeFixture?.cleanup();
        attributeFixture = null;
      },
    }
  );
});
