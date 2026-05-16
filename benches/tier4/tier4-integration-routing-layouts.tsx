/** @jsxImportSource @askrjs/askr */

import { bench, describe, expect } from 'vite-plus/test';
import { createSPA } from '../../src/boot';
import {
  clearRoutes,
  currentRoute,
  getManifest,
  group,
  navigate,
  route,
} from '../../src/router';
import { AccountSettingsForm } from '../../test-utils/playwright-app/src/scenarios/forms';
import { CustomerSearchPage } from '../../test-utils/playwright-app/src/scenarios/search-resource';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import { tier4BenchOptions } from '../shared/_shared';

function AppShell({ children }: { children?: unknown }) {
  const routeSnapshot = currentRoute();
  const path = routeSnapshot.path;

  return (
    <section aria-label="Askr CRM">
      <header>
        <h1>Askr CRM</h1>
        <nav aria-label="Primary navigation">
          <button
            type="button"
            aria-current={path === '/dashboard' ? 'page' : undefined}
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            aria-current={path === '/customers/search' ? 'page' : undefined}
            onClick={() => navigate('/customers/search')}
          >
            Customers
          </button>
          <button
            type="button"
            aria-current={path === '/settings' ? 'page' : undefined}
            onClick={() => navigate('/settings')}
          >
            Settings
          </button>
          <button
            type="button"
            aria-current={path === '/route-artifacts-a' ? 'page' : undefined}
            onClick={() => navigate('/route-artifacts-a')}
          >
            Artifacts A
          </button>
          <button
            type="button"
            aria-current={path === '/route-artifacts-b' ? 'page' : undefined}
            onClick={() => navigate('/route-artifacts-b')}
          >
            Artifacts B
          </button>
        </nav>
      </header>
      <main>{children}</main>
    </section>
  );
}

function DashboardPage() {
  return (
    <section aria-label="Dashboard">
      <h2>Dashboard</h2>
      <p>Review customer activity and recent orders.</p>
      <button type="button" onClick={() => navigate('/orders/1002')}>
        View order 1002
      </button>
    </section>
  );
}

function OrderDetailPage(params: { id: string }) {
  return (
    <section aria-label="Order detail">
      <h2>Order {params.id}</h2>
      <p>Order detail and fulfillment notes.</p>
      <button type="button" onClick={() => navigate('/dashboard')}>
        Back to dashboard
      </button>
    </section>
  );
}

function RouteArtifactsAPage() {
  return (
    <section aria-label="Route artifacts A">
      <h2>Route artifacts A</h2>
      <div data-testid="route-loose-text-container">
        <span>A leading label</span>
        {'A loose text artifact'}
        <span>A trailing label</span>
      </div>
      <div data-testid="route-large-keyed-list">
        {Array.from({ length: 80 }, (_, index) => (
          <div key={index}>{`A large keyed row ${index}`}</div>
        ))}
      </div>
      <div data-testid="route-artifact-card-list">
        {Array.from({ length: 16 }, (_, index) => (
          <article key={`a-${index}`} class="artifact-card">
            <h3>{`A card ${index}`}</h3>
            <p>{`A route detail ${index}`}</p>
            <aside data-route-artifact="a">{`A-only artifact ${index}`}</aside>
          </article>
        ))}
      </div>
    </section>
  );
}

function RouteArtifactsBPage() {
  return (
    <section aria-label="Route artifacts B">
      <h2>Route artifacts B</h2>
      <div data-testid="route-loose-text-container">
        <span>B leading label</span>
        <span>B trailing label</span>
      </div>
      <div data-testid="route-large-keyed-list">
        {Array.from({ length: 80 }, (_, index) => {
          const id = 79 - index;
          return <div key={id}>{`B large keyed row ${id}`}</div>;
        })}
      </div>
      <div data-testid="route-artifact-card-list">
        {Array.from({ length: 16 }, (_, index) => (
          <article key={`b-${index}`} class="artifact-card">
            <h3>{`B card ${index}`}</h3>
            <p>{`B route detail ${index}`}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ensureDashboardPath(): void {
  if (window.location.pathname !== '/dashboard') {
    window.history.replaceState({}, '', '/dashboard');
  }
}

clearRoutes();
ensureDashboardPath();

group({ layout: AppShell }, () => {
  route('/dashboard', DashboardPage);
  route('/customers/search', CustomerSearchPage);
  route('/settings', AccountSettingsForm);
  route('/orders/{id}', OrderDetailPage);
  route('/route-artifacts-a', RouteArtifactsAPage);
  route('/route-artifacts-b', RouteArtifactsBPage);
});

await (async () => {
  const { container, cleanup } = createTestContainer();

  try {
    ensureDashboardPath();
    await createSPA({ root: container, manifest: getManifest() });
    flushScheduler();

    expect(
      container.querySelector('section[aria-label="Askr CRM"]')
    ).not.toBeNull();

    navigate('/route-artifacts-a');
    flushScheduler();

    expect(
      container.querySelector('[aria-label="Route artifacts A"]')
    ).not.toBeNull();
    expect(container.textContent).toContain('A large keyed row 0');
  } finally {
    cleanup();
  }
})();

describe('tier4 integration routing layouts', () => {
  let cleanup: (() => void) | null = null;
  let routeToArtifactsA = true;

  bench(
    'navigate routed shell layouts in the integration app',
    () => {
      navigate(routeToArtifactsA ? '/route-artifacts-a' : '/route-artifacts-b');
      flushScheduler();
      routeToArtifactsA = !routeToArtifactsA;
    },
    {
      ...tier4BenchOptions,
      async setup() {
        ensureDashboardPath();
        const result = createTestContainer();
        cleanup = result.cleanup;
        await createSPA({ root: result.container, manifest: getManifest() });
        flushScheduler();
        routeToArtifactsA = true;
      },
      teardown() {
        cleanup?.();
        cleanup = null;
      },
    }
  );
});
