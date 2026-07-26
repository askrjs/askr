/** @jsxImportSource @askrjs/askr */

import { Link } from '@askrjs/askr/router';
import {
  createRouteRegistry,
  currentRoute,
  fallback,
  group,
  onRouteChange,
  route,
} from '@askrjs/askr/router';

const navigation = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/settings', label: 'Settings' },
] as const;

export type RouteCommitObserver = (path: string) => void;

function AppShell({
  children,
  onRouteCommitted,
}: {
  children?: unknown;
  onRouteCommitted: RouteCommitObserver;
}) {
  const activeRoute = currentRoute();

  onRouteChange((current) => {
    onRouteCommitted(current.path);
  });

  return (
    <div data-recipe-shell>
      <nav aria-label="Primary navigation">
        {navigation.map((item) => {
          const active = activeRoute.path === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              data-active={active ? 'true' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main>{children as never}</main>
    </div>
  );
}

function DashboardPage() {
  return <h1>Dashboard</h1>;
}

function SettingsPage() {
  return <h1>Settings</h1>;
}

function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <Link href="/dashboard">Return to the dashboard</Link>
    </section>
  );
}

export function createRoutedShellRegistry(
  onRouteCommitted: RouteCommitObserver = () => undefined
) {
  return createRouteRegistry(() => {
    group(
      {
        layout: ({ children }: { children?: unknown }) => (
          <AppShell onRouteCommitted={onRouteCommitted}>
            {children as never}
          </AppShell>
        ),
      },
      () => {
        route('/dashboard', DashboardPage);
        route('/settings', SettingsPage);
        fallback(NotFoundPage);
      }
    );
  });
}
