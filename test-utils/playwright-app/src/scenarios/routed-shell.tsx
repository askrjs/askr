/** @jsxImportSource @askrjs/askr */

import { createSPA } from '@askrjs/askr/boot';
import {
  clearRoutes,
  currentRoute,
  getManifest,
  group,
  navigate,
  route,
} from '@askrjs/askr/router';
import { AccountSettingsForm } from './forms';
import { CustomerSearchPage } from './search-resource';

function isRoutedShellPath(pathname: string): boolean {
  return (
    pathname === '/dashboard' ||
    pathname === '/customers/search' ||
    pathname === '/settings' ||
    pathname === '/route-artifacts-a' ||
    pathname === '/route-artifacts-b' ||
    pathname.startsWith('/orders/')
  );
}

function AppShell({ children }: { children?: unknown }) {
  const route = currentRoute();
  const path = route.path;

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

function SettingsPage() {
  return <AccountSettingsForm />;
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

export async function mountRoutedShellScenario(
  root: HTMLElement
): Promise<void> {
  clearRoutes();

  group({ layout: AppShell }, () => {
    route('/dashboard', DashboardPage);
    route('/customers/search', CustomerSearchPage);
    route('/settings', SettingsPage);
    route('/orders/{id}', OrderDetailPage);
    route('/route-artifacts-a', RouteArtifactsAPage);
    route('/route-artifacts-b', RouteArtifactsBPage);
  });

  if (!isRoutedShellPath(window.location.pathname)) {
    window.history.replaceState({}, '', '/dashboard');
  }

  await createSPA({ root, manifest: getManifest() });
}

export function shouldMountRoutedShellFromPath(pathname: string): boolean {
  return isRoutedShellPath(pathname);
}
