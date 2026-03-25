import { For } from '@askrjs/askr/for';
import { Skeleton } from '@askrjs/askr-ui/skeleton';
import EmptyState from './empty-state';
import { joinClasses } from '../utils/join-classes';

export type DataTableColumn<Row> = {
  key: string;
  header: unknown;
  class?: string;
  render: (row: Row) => unknown;
};

export default function DataTable<Row>(props: {
  rows: () => Row[];
  rowKey: (row: Row) => string;
  columns: DataTableColumn<Row>[];
  class?: string;
  tableClass?: string;
  rowClass?: (row: Row) => string | undefined;
  isLoading?: boolean;
  errorText?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (props.errorText) {
    return (
      <EmptyState title="Could not load table" description={props.errorText} />
    );
  }

  if (props.isLoading) {
    return (
      <div
        class={joinClasses('panel stack-sm', props.class)}
        aria-hidden="true"
      >
        <Skeleton class="skeleton-line" />
        <Skeleton class="skeleton-line" />
        <Skeleton class="skeleton-line" />
      </div>
    );
  }

  if (props.rows().length === 0) {
    return (
      <EmptyState
        title={props.emptyTitle ?? 'No rows found'}
        description={
          props.emptyDescription ??
          'Try changing filters or adding new records.'
        }
      />
    );
  }

  return (
    <div class={joinClasses('table-wrap', props.class)}>
      <table class={props.tableClass}>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th class={column.class}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {For(props.rows, props.rowKey, (row: Row) => (
            <tr class={props.rowClass?.(row)}>
              {props.columns.map((column) => (
                <td class={column.class}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
