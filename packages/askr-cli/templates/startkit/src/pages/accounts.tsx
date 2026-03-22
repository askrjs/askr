import { state } from '@askrjs/askr';
import { resource } from '@askrjs/askr/resources';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@askrjs/askr-ui/alert-dialog';
import { Button } from '@askrjs/askr-ui/button';
import { Inline } from '@askrjs/askr-ui/inline';
import { Pagination } from '@askrjs/askr-ui/pagination';
import { Archive, Plus } from '@askrjs/askr-lucide';
import PageHeader from '../components/page-header';
import AccountFilters from '../features/accounts/account-filters';
import AccountTable from '../features/accounts/account-table';
import {
  archiveAccounts,
  listAccounts,
  type AccountRecord,
  type AccountStatus,
} from '../lib/mock-data';
import { showToast } from '../toast';

export default function AccountsPage() {
  const [query, setQuery] = state('');
  const [status, setStatus] = state<AccountStatus | 'all'>('all');
  const [page, setPage] = state(1);
  const [selectedIds, setSelectedIds] = state<string[]>([]);
  const [archiving, setArchiving] = state(false);

  const pageSize = 5;

  const accountsResource = resource(
    async ({ signal }) =>
      listAccounts({
        signal,
        query: query(),
        status: status(),
        page: page(),
        pageSize,
      }),
    [query(), status(), page()]
  );

  const rows = () => accountsResource.value?.items ?? [];
  const totalPages = () => accountsResource.value?.totalPages ?? 1;

  const toggleRow = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  };

  const resetFilters = () => {
    setQuery('');
    setStatus('all');
    setPage(1);
  };

  const openRow = (row: AccountRecord) => {
    showToast({
      title: row.name,
      description: `Open account ${row.id} details in your real product workflow.`,
    });
  };

  const archiveSelected = async () => {
    if (selectedIds().length === 0) {
      return;
    }

    setArchiving(true);

    try {
      const result = await archiveAccounts({ ids: selectedIds() });
      setSelectedIds([]);
      showToast({
        title: 'Accounts archived',
        description: `${result.archived} account records moved to archived status.`,
      });
      await accountsResource.refresh();
    } catch (error) {
      showToast({
        title: 'Archive failed',
        description:
          error instanceof Error
            ? error.message
            : 'Could not archive selected rows.',
      });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <section class="stack-lg">
      <PageHeader
        title="Accounts"
        description="Search, filter, page, and run row actions against account records."
        actions={
          <Button
            onPress={() =>
              showToast({
                title: 'Create account',
                description:
                  'Wire this button into your real create-account form flow.',
              })
            }
          >
            <Plus size={14} aria-hidden="true" /> Add account
          </Button>
        }
      />

      <section class="panel stack-md">
        <AccountFilters
          query={query()}
          status={status()}
          onQueryChange={(next) => {
            setQuery(next);
            setPage(1);
          }}
          onStatusChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
          onReset={resetFilters}
        />

        <AccountTable
          rows={rows}
          selectedIds={selectedIds}
          onToggleRow={toggleRow}
          onOpenRow={openRow}
          loading={accountsResource.pending && !accountsResource.value}
          errorText={accountsResource.error?.message ?? null}
        />

        <Inline align="center" gap="var(--ak-space-lg)" wrap="wrap">
          <span class="muted">{selectedIds().length} selected</span>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={selectedIds().length === 0}
                class="button-secondary"
              >
                <Archive size={14} aria-hidden="true" /> Archive selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogPortal>
              <AlertDialogOverlay />
              <AlertDialogContent class="panel stack-md">
                <AlertDialogTitle>Archive selected accounts?</AlertDialogTitle>
                <AlertDialogDescription>
                  This updates selected account records in the mock data source.
                </AlertDialogDescription>
                <div class="inline-end">
                  <AlertDialogCancel asChild>
                    <Button class="button-secondary">Cancel</Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button
                      onPress={() => void archiveSelected()}
                      disabled={archiving()}
                    >
                      {archiving() ? 'Archiving...' : 'Confirm archive'}
                    </Button>
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialogPortal>
          </AlertDialog>

          <Pagination
            count={totalPages()}
            page={page()}
            onPageChange={setPage}
          />
        </Inline>
      </section>
    </section>
  );
}
