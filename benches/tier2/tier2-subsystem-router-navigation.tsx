import { bench, describe, expect } from 'vite-plus/test';
import { createSPA } from '../../src/boot';
import { createRouteRegistry, group, route } from '../../src/router';
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

const Layout = ({ children }: { children?: unknown }) => (
  <div class="layout">{children as never}</div>
);

function createNavigationRegistry() {
  return createRouteRegistry(() => {
    group({ layout: Layout }, () => {
      route('/alpha', () => <div class="page">Alpha</div>);
      route('/beta', () => <div class="page">Beta</div>);
    });
  });
}

await (async () => {
  const { container, cleanup } = createTestContainer();

  try {
    setLocationPath('/alpha');
    const registry = createNavigationRegistry();
    await createSPA({ root: container, registry });
    flushScheduler();
    const layout = container.querySelector('.layout');
    await navigate('/beta');
    flushScheduler();
    expect(container.querySelector('.layout')).toBe(layout);
    expect(container.querySelector('.page')?.textContent).toBe('Beta');
    await navigate('/alpha');
    flushScheduler();
    expect(container.querySelector('.layout')).toBe(layout);
    expect(container.querySelector('.page')?.textContent).toBe('Alpha');
  } finally {
    cleanup();
    resetRouterState();
  }
})();

describe('tier2 router navigation', () => {
  let cleanup: (() => void) | null = null;
  let nextPath = '/beta';

  bench(
    'navigate between sibling routes with shared layout shape',
    async () => {
      await navigate(nextPath);
      flushScheduler();
      nextPath = nextPath === '/beta' ? '/alpha' : '/beta';
    },
    {
      ...tier2BenchOptions,
      async setup() {
        nextPath = '/beta';
        const result = createTestContainer();
        cleanup = result.cleanup;
        setLocationPath('/alpha');
        const registry = createNavigationRegistry();
        await createSPA({ root: result.container, registry });
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
