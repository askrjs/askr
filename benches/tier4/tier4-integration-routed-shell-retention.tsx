import { bench, describe, expect } from 'vite-plus/test';
import { cleanupApp } from '../../src/boot';
import { navigate } from '../../src/router/navigate';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import { mountRoutedShellScenario } from '../../test-utils/playwright-app/src/scenarios/routed-shell';
import {
  extendBenchOptions,
  resetRouterState,
  setLocationPath,
  tier4BenchOptions,
} from '../shared/_shared';

const routedShellRetentionBenchOptions = extendBenchOptions(tier4BenchOptions, {
  time: 2200,
  iterations: 3,
  warmupTime: 250,
  warmupIterations: 1,
});

await (async () => {
  const { container, cleanup } = createTestContainer();

  try {
    setLocationPath('/dashboard');
    await mountRoutedShellScenario(container);
    flushScheduler();

    expect(
      container.querySelector('section[aria-label="Askr CRM"]')
    ).not.toBeNull();

    navigate('/route-artifacts-a');
    flushScheduler();
    navigate('/settings');
    flushScheduler();

    cleanupApp(container);
    flushScheduler();
    container.innerHTML = '';

    expect(
      container.querySelector('section[aria-label="Askr CRM"]')
    ).toBeNull();
  } finally {
    cleanup();
    resetRouterState();
  }
})();

describe('tier4 integration routed shell retention', () => {
  let cleanup: (() => void) | null = null;
  let root: HTMLDivElement | null = null;

  bench(
    'mount, churn, and unmount the routed shell',
    async () => {
      await mountRoutedShellScenario(root!);
      flushScheduler();

      navigate('/route-artifacts-a');
      flushScheduler();
      navigate('/settings');
      flushScheduler();
      navigate('/dashboard');
      flushScheduler();

      cleanupApp(root!);
      flushScheduler();
      root!.innerHTML = '';
      resetRouterState();
    },
    {
      ...routedShellRetentionBenchOptions,
      async setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;
        root = result.container;
        setLocationPath('/dashboard');
      },
      beforeEach() {
        if (root!.querySelector('section[aria-label="Askr CRM"]')) {
          throw new Error('Expected routed shell root to start empty.');
        }

        root!.innerHTML = '';
        resetRouterState();
        setLocationPath('/dashboard');
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        root = null;
        resetRouterState();
      },
    }
  );
});
