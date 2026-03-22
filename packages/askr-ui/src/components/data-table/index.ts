// Factory and helpers
export { createDataTable, column } from './create-data-table';

// Root and content
export { DataTableRoot, DataTableContent } from './data-table';

// Table view
export {
  DataTableTableView,
  DataTableTableHeader,
  DataTableTableBody,
  DataTableHeaderRow,
  DataTableHead,
  DataTableRow,
  DataTableCell,
  DataTableExpandedRow,
} from './data-table-table-view';

// List view
export {
  DataTableListView,
  DataTableListItem,
  DataTableListMain,
  DataTableListMeta,
  DataTableListActions,
  DataTableListExpanded,
} from './data-table-list-view';

// Toolbar
export { DataTableToolbar, DataTableSearch } from './data-table-toolbar';

// Pagination
export { DataTablePagination } from './data-table-pagination';

// State display
export {
  DataTableEmpty,
  DataTableLoading,
  DataTableError,
} from './data-table-states';

// Accessibility contract
export {
  DATA_TABLE_A11Y_CONTRACT,
  type DataTableA11yContract,
} from './data-table.a11y';

// Types
export type {
  // State shapes
  SortDescriptor,
  SortingState,
  FilterState,
  PaginationState,
  RowSelectionState,
  RowExpansionState,
  ColumnVisibilityState,
  DataState,
  DataTableSerializableState,

  // Column
  ColumnDef,
  ColumnMobileConfig,
  ResolvedColumnDef,

  // Row and cell models
  DataTableRow as DataTableRowModel,
  DataTableCell as DataTableCellModel,

  // Config
  MobileRowConfig,
  ResponsiveConfig,
  SortingConfig,
  FilteringConfig,
  SelectionConfig,
  ExpansionConfig,
  PaginationConfig,
  ColumnVisibilityConfig,

  // Factory
  DataTableOptions,
  DataTableInstance,

  // Component props
  DataTableRootProps,
  DataTableContentProps,
  DataTableTableViewProps,
  DataTableTableHeaderProps,
  DataTableTableBodyProps,
  DataTableHeaderRowProps,
  DataTableHeadProps,
  DataTableRowProps,
  DataTableCellProps,
  DataTableExpandedRowProps,
  DataTableListViewProps,
  DataTableListItemProps,
  DataTableListMainProps,
  DataTableListMetaProps,
  DataTableListActionsProps,
  DataTableListExpandedProps,
  DataTableToolbarProps,
  DataTableSearchProps,
  DataTablePaginationProps,
  DataTableEmptyProps,
  DataTableLoadingProps,
  DataTableErrorProps,
} from './data-table.types';
