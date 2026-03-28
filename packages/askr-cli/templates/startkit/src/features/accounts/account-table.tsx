import { Checkbox } from '@askrjs/askr-ui/checkbox';
import { Button } from '@askrjs/askr-ui/button';
import { EyeIcon } from '@askrjs/askr-lucide';
import DataTable, { type DataTableColumn } from '../../components/data-table';
import type { AccountRecord } from '../../lib/mock-data';
import { formatCurrency } from '../../lib/format';

export default function AccountTable(props: {
  rows: () => AccountRecord[];
  selectedIds: () => string[];
  onToggleRow: (id: string) => void;
  onOpenRow: (row: AccountRecord) => void;
  loading?: boolean;
  errorText?: string | null;
}) {
  const columns: DataTableColumn<AccountRecord>[] = [
    {
      key: 'select',
      header: 'Select',
      class: 'cell-select',
      render: (row) => (
        <Checkbox
          checked={props.selectedIds().includes(row.id)}
          onPress={() => props.onToggleRow(row.id)}
          aria-label={`Select ${row.name}`}
        />
      ),
    },
    {
      key: 'account',
      header: 'Account',
      render: (row) => (
        <div class="entity-copy">
          <strong>{row.name}</strong>
          <span class="muted">{row.email}</span>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (row) => row.plan,
    },
    {
      key: 'mrr',
      header: 'MRR',
      render: (row) => formatCurrency(row.mrr),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span class={`status-pill status-${row.status}`}>{row.status}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      class: 'cell-actions',
      render: (row) => (
        <Button onPress={() => props.onOpenRow(row)}>
          <EyeIcon size={14} aria-hidden="true" /> View
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      rows={props.rows}
      rowKey={(row) => row.id}
      columns={columns}
      isLoading={props.loading}
      errorText={props.errorText}
      emptyTitle="No accounts matched"
      emptyDescription="Try a broader search, or clear your status filter."
    />
  );
}
