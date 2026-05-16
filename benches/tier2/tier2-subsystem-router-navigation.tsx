import { bench, describe, expect } from 'vite-plus/test';
import { createSPA } from '../../src/boot';
import { navigate } from '../../src/router/navigate';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import {
  resetRouterState,
  setLocationPath,
  tier2BenchOptions,
} from '../shared/_shared';

await (async () => {
  const { container, cleanup } = createTestContainer();

  const routes = [
    {
      path: '/alpha',
      handler: () => (
        <div class="layout">
          <div class="page">Alpha</div>
        </div>
      ),
    },
    {
      path: '/beta',
      handler: () => (
        <div class="layout">
          <div class="page">Beta</div>
        </div>
      ),
    },
  ];

  try {
    setLocationPath('/alpha');
    await createSPA({ root: container, routes });
    flushScheduler();
    const layout = container.querySelector('.layout');
    navigate('/beta');
    flushScheduler();
    expect(container.querySelector('.layout')).toBe(layout);
    expect(container.querySelector('.page')?.textContent).toBe('Beta');
  } finally {
    cleanup();
    resetRouterState();
  }
})();

describe('tier2 router navigation', () => {
  let cleanup: (() => void) | null = null;

  bench(
    'navigate between sibling routes with shared layout shape',
    async () => {
      navigate('/beta');
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      async setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;
        setLocationPath('/alpha');
        await createSPA({
          root: result.container,
          routes: [
            {
              path: '/alpha',
              handler: () => (
                <div class="layout">
                  <div class="page">Alpha</div>
                </div>
              ),
            },
            {
              path: '/beta',
              handler: () => (
                <div class="layout">
                  <div class="page">Beta</div>
                </div>
              ),
            },
          ],
        });
        flushScheduler();
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        resetRouterState();
      },
    }
  );
});
