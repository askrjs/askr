import { state } from '@askrjs/askr';
import { resource } from '@askrjs/askr/resources';
import { Button } from '@askrjs/askr-ui/button';
import {
  BarChart3Icon,
  CircleDollarSignIcon,
  Clock3Icon,
  UsersIcon,
} from '@askrjs/askr-lucide';
import DataTable, { type DataTableColumn } from '../../components/data-table';
import EmptyState from '../../components/empty-state';
import PageHeader from '../../components/page-header';
import StatCard from '../../components/stat-card';
import { getDashboardData, type ActivityEntry } from '../../lib/mock-data';
import { formatRelativeDate } from '../../lib/format';

export default function DashboardPage() {
  const [hideActivityState, setHideActivityState] = state(false);
  const dashboardResource = resource(
    async ({ signal }) => getDashboardData({ signal }),
    []
  );

  const stats = () => dashboardResource.value?.stats ?? [];
  const activities = () =>
    hideActivityState() ? [] : (dashboardResource.value?.activities ?? []);

  const columns: DataTableColumn<ActivityEntry>[] = [
    { key: 'actor', header: 'Actor', render: (row) => row.actor },
    { key: 'action', header: 'Action', render: (row) => row.action },
    { key: 'resource', header: 'Resource', render: (row) => row.resource },
    {
      key: 'timestamp',
      header: 'When',
      render: (row) => (
        <span class="muted">{formatRelativeDate(row.timestamp)}</span>
      ),
    },
  ];

  const iconByStatKey = {
    mrr: CircleDollarSignIcon,
    accounts: UsersIcon,
    pending: Clock3Icon,
    seats: BarChart3Icon,
  } as const;

  return (
    <section class="stack-lg">
      <PageHeader
        title="Dashboard"
        description="Overview of workspace health, growth, and recent team activity."
        actions={
          <Button
            onPress={() => dashboardResource.refresh()}
            disabled={dashboardResource.pending}
          >
            {dashboardResource.pending ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      <div class="stat-grid">
        {stats().map((stat) => {
          const Icon =
            iconByStatKey[stat.key as keyof typeof iconByStatKey] ??
            BarChart3Icon;
          return (
            <StatCard
              label={stat.label}
              value={stat.value}
              trend={stat.trend}
              icon={Icon}
            />
          );
        })}
      </div>

      <section class="panel stack-md">
        <div class="section-head">
          <div>
            <h2>Recent activity</h2>
            <p class="muted">
              The activity table demonstrates loading, empty, and retry
              behavior.
            </p>
          </div>
          <Button
            onPress={() => setHideActivityState((current) => !current)}
            class="button-secondary"
            disabled={dashboardResource.pending}
          >
            {hideActivityState() ? 'Show activity' : 'Show empty state'}
          </Button>
        </div>

        {dashboardResource.error ? (
          <EmptyState
            title="Could not load dashboard"
            description={dashboardResource.error.message}
            action={
              <Button onPress={() => dashboardResource.refresh()}>Retry</Button>
            }
          />
        ) : (
          <DataTable
            rows={activities}
            rowKey={(row) => row.id}
            columns={columns}
            isLoading={dashboardResource.pending && !dashboardResource.value}
            emptyTitle="No activity yet"
            emptyDescription="Your activity feed will appear as soon as workspace events are recorded."
          />
        )}
      </section>
    </section>
  );
}
