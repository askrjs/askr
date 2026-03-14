import { bench, describe, expect } from 'vitest';
import { createSPA } from '../../src';
import { navigate } from '../../src/router/navigate';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';
import {
  resetRouterState,
  setLocationPath,
  tier4BenchOptions,
} from '../shared/_shared';

const routes = [
  {
    path: '/dashboard',
    handler: () => (
      <section class="shell">
        <header>Bench Router</header>
        <main class="page">Dashboard</main>
      </section>
    ),
  },
  {
    path: '/reports',
    handler: () => (
      <section class="shell">
        <header>Bench Router</header>
        <main class="page">Reports</main>
      </section>
    ),
  },
  {
    path: '/settings',
    handler: () => (
      <section class="shell">
        <header>Bench Router</header>
        <main class="page">Settings</main>
      </section>
    ),
  },
];

await (async () => {
  const { container, cleanup } = createTestContainer();
  try {
    setLocationPath('/dashboard');
    await createSPA({ root: container, routes });
    flushScheduler();
    const shell = container.querySelector('.shell');
    navigate('/reports');
    flushScheduler();
    expect(container.querySelector('.shell')).toBe(shell);
    expect(container.querySelector('.page')?.textContent).toBe('Reports');
  } finally {
    cleanup();
    resetRouterState();
  }
})();

describe('tier4 integration router app', () => {
  let cleanup: (() => void) | null = null;

  bench(
    'churn across dashboard, reports, and settings',
    async () => {
      navigate('/reports');
      flushScheduler();
      navigate('/settings');
      flushScheduler();
      navigate('/dashboard');
      flushScheduler();
    },
    {
      ...tier4BenchOptions,
      async setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;
        setLocationPath('/dashboard');
        await createSPA({ root: result.container, routes });
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
