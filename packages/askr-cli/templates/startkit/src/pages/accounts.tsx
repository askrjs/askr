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
  const queryState = state('');
  const statusState = state<AccountStatus | 'all'>('all');
  const pageState = state(1);
  const selectedIdsState = state<string[]>([]);
  const archivingState = state(false);

  const pageSize = 5;

  const accountsResource = resource(
    async ({ signal }) =>
      listAccounts({
        signal,
        query: queryState(),
        status: statusState(),
        page: pageState(),
        pageSize,
      }),
    [queryState(), statusState(), pageState()]
  );

  const rows = () => accountsResource.value?.items ?? [];
  const totalPages = () => accountsResource.value?.totalPages ?? 1;

  const toggleRow = (id: string) => {
    selectedIdsState.set((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  };

  const resetFilters = () => {
    queryState.set('');
    statusState.set('all');
    pageState.set(1);
  };

  const openRow = (row: AccountRecord) => {
    showToast({
      title: row.name,
      description: `Open account ${row.id} details in your real product workflow.`,
    });
  };

  const archiveSelected = async () => {
    if (selectedIdsState().length === 0) {
      return;
    }

    archivingState.set(true);

    try {
      const result = await archiveAccounts({ ids: selectedIdsState() });
      selectedIdsState.set([]);
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
      archivingState.set(false);
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
          query={queryState()}
          status={statusState()}
          onQueryChange={(next) => {
            queryState.set(next);
            pageState.set(1);
          }}
          onStatusChange={(next) => {
            statusState.set(next);
            pageState.set(1);
          }}
          onReset={resetFilters}
        />

        <AccountTable
          rows={rows}
          selectedIds={selectedIdsState}
          onToggleRow={toggleRow}
          onOpenRow={openRow}
          loading={accountsResource.pending && !accountsResource.value}
          errorText={accountsResource.error?.message ?? null}
        />

        <Inline align="center" gap="var(--ak-space-lg)" wrap="wrap">
          <span class="muted">{selectedIdsState().length} selected</span>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={selectedIdsState().length === 0}
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
                      disabled={archivingState()}
                    >
                      {archivingState() ? 'Archiving...' : 'Confirm archive'}
                    </Button>
                  </AlertDialogAction>
                </div>
              </AlertDialogContent>
            </AlertDialogPortal>
          </AlertDialog>

          <Pagination
            count={totalPages()}
            page={pageState()}
            onPageChange={pageState.set}
          />
        </Inline>
      </section>
    </section>
  );
}
