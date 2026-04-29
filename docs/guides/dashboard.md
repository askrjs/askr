# Dashboard Guide

Patterns for building dashboard layouts with Askr.

Dashboards are route-driven pages that combine layout, summary metrics, tables,
and navigation. Keep the shell layout separate from the dashboard route so other
authenticated pages can reuse it.

## Recommended Structure

```text
src/layouts/
  app-layout.tsx

src/components/
  stat-card.tsx
  app-sidebar.tsx
  app-header.tsx

src/routes/
  dashboard.tsx
```

## Route Pattern

```tsx
import { resource } from '@askrjs/askr/resources';
import { DashboardTable } from '../components/dashboard-table';
import { StatCard } from '../components/stat-card';
import { loadDashboard } from '../lib/dashboard';

export function DashboardRoute() {
  const dashboard = resource(({ signal }) => loadDashboard({ signal }), []);

  if (dashboard.pending) return <p>Loading dashboard...</p>;
  if (dashboard.error) return <p role="alert">Unable to load dashboard.</p>;

  const data = dashboard.value;

  return (
    <section data-slot="dashboard">
      <header data-slot="dashboard-header">
        <h1>Dashboard</h1>
      </header>
      <div data-slot="dashboard-stats">
        <StatCard label="Active users" value={data.activeUsers} />
      </div>
      <DashboardTable rows={data.rows} />
    </section>
  );
}
```

## Common Pitfalls

- Keep navigation state in the router, not duplicated in the dashboard page.
- Keep metric formatting in small helpers so tables and cards stay deterministic.
- Use package-owned UI and theme docs for component-specific behavior and styling.

## See Also

- [Guide: layouts](./layouts.md)
- [Core: routing](../core/routing.md)
- [CLI: startkit template](https://github.com/askrjs/askr-cli/tree/main/docs/create.md)
