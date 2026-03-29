import { mergeProps, pressable } from '@askrjs/askr/foundations';
import { DATA_TABLE_A11Y_CONTRACT } from './data-table.a11y';
import type {
  DataTableCellProps,
  DataTableExpandedRowProps,
  DataTableHeadProps,
  DataTableHeaderRowProps,
  DataTableRowProps,
  DataTableTableBodyProps,
  DataTableTableHeaderProps,
  DataTableTableViewProps,
  InjectedDataTableProps,
} from './data-table.types';

const SLOTS = DATA_TABLE_A11Y_CONTRACT.SLOTS;

export function DataTableTableView<T>(
  props: DataTableTableViewProps & InjectedDataTableProps<T>
) {
  const { children, ref, __table, __tableId, ...rest } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.table,
    'data-responsive-view': 'table',
    'aria-busy': __table?.getDataState() === 'loading' ? 'true' : undefined,
  });

  if (children !== undefined && children !== null) {
    return <table {...finalProps}>{children}</table>;
  }

  // Auto-render default table structure
  return (
    <table {...finalProps}>
      <DataTableTableHeader __table={__table} __tableId={__tableId}>
        <DataTableHeaderRow __table={__table} __tableId={__tableId} />
      </DataTableTableHeader>
      <DataTableTableBody __table={__table} __tableId={__tableId} />
    </table>
  );
}

export function DataTableTableHeader<T>(
  props: DataTableTableHeaderProps & InjectedDataTableProps<T>
) {
  const { children, ref, __table, __tableId, ...rest } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.thead,
  });

  return <thead {...finalProps}>{children}</thead>;
}

export function DataTableTableBody<T>(
  props: DataTableTableBodyProps & InjectedDataTableProps<T>
) {
  const { children, ref, __table, __tableId, ...rest } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.tbody,
  });

  if (children !== undefined && children !== null) {
    return <tbody {...finalProps}>{children}</tbody>;
  }

  // Auto-render rows
  const pageRows = __table?.getPageRows() ?? [];

  return (
    <tbody {...finalProps}>
      {pageRows.map((row) => [
        <DataTableRow
          key={row.id}
          row={row}
          __table={__table}
          __tableId={__tableId}
        />,
        row.isExpanded() ? (
          <DataTableExpandedRow
            key={`${row.id}-expanded`}
            row={row}
            __table={__table}
            __tableId={__tableId}
          />
        ) : null,
      ])}
    </tbody>
  );
}

export function DataTableHeaderRow<T>(
  props: DataTableHeaderRowProps & InjectedDataTableProps<T>
) {
  const { children, ref, __table, __tableId, ...rest } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.headerRow,
  });

  if (children !== undefined && children !== null) {
    return <tr {...finalProps}>{children}</tr>;
  }

  // Auto-render header cells
  const columns = __table?.getVisibleColumns() ?? [];

  return (
    <tr {...finalProps}>
      {columns.map((col) => (
        <DataTableHead
          key={col.id}
          column={col}
          __table={__table}
          __tableId={__tableId}
        />
      ))}
    </tr>
  );
}

export function DataTableHead<T>(
  props: DataTableHeadProps & InjectedDataTableProps<T>
) {
  const { children, column, ref, __table, __tableId, ...rest } = props;

  const sortDirection = column
    ? __table?.getColumnSortDirection(column.id)
    : false;

  const ariaSortValue =
    sortDirection === 'asc'
      ? DATA_TABLE_A11Y_CONTRACT.SORT_VALUES.ascending
      : sortDirection === 'desc'
        ? DATA_TABLE_A11Y_CONTRACT.SORT_VALUES.descending
        : column?.sortable
          ? DATA_TABLE_A11Y_CONTRACT.SORT_VALUES.none
          : undefined;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.head,
    'data-column-id': column?.id,
    'data-sort-direction': sortDirection || undefined,
    'aria-sort': ariaSortValue,
  });

  const headerContent =
    children ??
    (typeof column?.header === 'function' ? column.header() : column?.header);

  if (column?.sortable && __table) {
    const interactionProps = pressable({
      disabled: false,
      onPress: () => __table.toggleSort(column.id),
      isNativeButton: true,
    });

    return (
      <th {...finalProps}>
        <button
          type="button"
          data-slot="data-table-sort-trigger"
          {...interactionProps}
        >
          {headerContent}
        </button>
      </th>
    );
  }

  return <th {...finalProps}>{headerContent}</th>;
}

export function DataTableRow<T>(
  props: DataTableRowProps<T> & InjectedDataTableProps<T>
) {
  const { children, row, ref, __table, __tableId, ...rest } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.row,
    'data-row-id': row.id,
    'data-selected': row.isSelected() ? 'true' : undefined,
    'data-expanded': row.isExpanded() ? 'true' : undefined,
    'aria-selected': row.isSelected() ? 'true' : undefined,
  });

  if (children !== undefined && children !== null) {
    return <tr {...finalProps}>{children}</tr>;
  }

  // Auto-render cells
  const cells = row.getVisibleCells();

  return (
    <tr {...finalProps}>
      {cells.map((cell) => (
        <DataTableCell
          key={cell.id}
          cell={cell}
          __table={__table}
          __tableId={__tableId}
        />
      ))}
    </tr>
  );
}

export function DataTableCell<T>(
  props: DataTableCellProps<T> & InjectedDataTableProps<T>
) {
  const { children, cell, ref, __table, __tableId, ...rest } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.cell,
    'data-column-id': cell.column.id,
  });

  return <td {...finalProps}>{children ?? cell.renderValue()}</td>;
}

export function DataTableExpandedRow<T>(
  props: DataTableExpandedRowProps<T> & InjectedDataTableProps<T>
) {
  const { children, row, ref, __table, __tableId, ...rest } = props;
  const colCount = __table?.getVisibleColumns().length ?? 1;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.expandedRow,
    'data-row-id': row.id,
  });

  return (
    <tr {...finalProps}>
      <td colSpan={colCount} role="region" data-slot={SLOTS.expandedCell}>
        {children}
      </td>
    </tr>
  );
}
