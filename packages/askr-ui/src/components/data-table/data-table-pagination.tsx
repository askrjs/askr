import { mergeProps, pressable } from '@askrjs/askr/foundations';
import { DATA_TABLE_A11Y_CONTRACT } from './data-table.a11y';
import type {
  DataTablePaginationProps,
  InjectedDataTableProps,
} from './data-table.types';

const SLOTS = DATA_TABLE_A11Y_CONTRACT.SLOTS;

export function DataTablePagination<T>(
  props: DataTablePaginationProps & InjectedDataTableProps<T>
) {
  const { children, ref, __table, __tableId, ...rest } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'aria-label': 'Pagination',
    'data-slot': SLOTS.pagination,
  });

  if (children !== undefined && children !== null) {
    return <nav {...finalProps}>{children}</nav>;
  }

  if (!__table) {
    return <nav {...finalProps} />;
  }

  // Auto-render default pagination controls
  const prevProps = pressable({
    disabled: !__table.canPreviousPage(),
    onPress: () => __table.previousPage(),
    isNativeButton: true,
  });

  const nextProps = pressable({
    disabled: !__table.canNextPage(),
    onPress: () => __table.nextPage(),
    isNativeButton: true,
  });

  const pagination = __table.getPagination();
  const pageCount = __table.getPageCount();

  return (
    <nav {...finalProps}>
      <button
        type="button"
        aria-label="Previous page"
        data-slot="data-table-pagination-previous"
        data-disabled={!__table.canPreviousPage() ? 'true' : undefined}
        {...prevProps}
      >
        Previous
      </button>
      <span data-slot="data-table-pagination-info">
        Page {pagination.page} of {pageCount}
      </span>
      <button
        type="button"
        aria-label="Next page"
        data-slot="data-table-pagination-next"
        data-disabled={!__table.canNextPage() ? 'true' : undefined}
        {...nextProps}
      >
        Next
      </button>
    </nav>
  );
}
