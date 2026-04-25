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

export async function mountRoutedShellScenario(
  root: HTMLElement
): Promise<void> {
  clearRoutes();

  group({ layout: AppShell }, () => {
    route('/dashboard', DashboardPage);
    route('/customers/search', CustomerSearchPage);
    route('/settings', SettingsPage);
    route('/orders/{id}', OrderDetailPage);
  });

  if (!isRoutedShellPath(window.location.pathname)) {
    window.history.replaceState({}, '', '/dashboard');
  }

  await createSPA({ root, manifest: getManifest() });
}

export function shouldMountRoutedShellFromPath(pathname: string): boolean {
  return isRoutedShellPath(pathname);
}
