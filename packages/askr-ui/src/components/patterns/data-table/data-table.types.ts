import type { BoxAsChildProps, BoxProps } from '../../_internal/types';

// ─── State shapes (all serializable) ───

export type SortDescriptor = {
  id: string;
  desc: boolean;
};

export type SortingState = SortDescriptor[];

export type FilterState = {
  global: string;
  columns: Record<string, unknown>;
};

export type PaginationState = {
  page: number;
  pageSize: number;
};

export type RowSelectionState = Record<string, boolean>;
export type RowExpansionState = Record<string, boolean>;
export type ColumnVisibilityState = Record<string, boolean>;

export type DataState =
  | 'idle'
  | 'loading'
  | 'error'
  | 'empty'
  | 'filtered-empty';

export type DataTableSerializableState = {
  sorting: SortingState;
  filters: FilterState;
  pagination: PaginationState;
  selection: RowSelectionState;
  expansion: RowExpansionState;
  columnVisibility: ColumnVisibilityState;
};

// ─── Column definitions ───

export type ColumnMobileConfig = {
  priority?: number;
  hidden?: boolean;
  label?: string;
};

export type ColumnDef<T> = {
  id: string;
  header: string | (() => unknown);
  accessor: (row: T) => unknown;
  cell?: (props: { value: unknown; row: DataTableRow<T> }) => unknown;
  sortable?: boolean;
  filterable?: boolean;
  filterFn?: (row: T, columnId: string, filterValue: unknown) => boolean;
  sortFn?: (a: T, b: T, columnId: string) => number;
  mobile?: ColumnMobileConfig;
  defaultVisible?: boolean;
  meta?: Record<string, unknown>;
};

export type ResolvedColumnDef<T> = Required<
  Pick<ColumnDef<T>, 'id' | 'header' | 'accessor'>
> &
  Omit<ColumnDef<T>, 'id' | 'header' | 'accessor'>;

// ─── Row and cell models ───

export interface DataTableRow<T> {
  id: string;
  index: number;
  original: T;
  getVisibleCells(): DataTableCell<T>[];
  getCellValue(columnId: string): unknown;
  isSelected(): boolean;
  isExpanded(): boolean;
  isSelectable(): boolean;
  toggleSelected(): void;
  toggleExpanded(): void;
  getListPrimary(): unknown;
  getListSecondary(): unknown[];
  getListMeta(): unknown[];
  getListActions(): unknown;
}

export interface DataTableCell<T> {
  id: string;
  column: ResolvedColumnDef<T>;
  row: DataTableRow<T>;
  getValue(): unknown;
  renderValue(): unknown;
}

// ─── Mobile row config ───

export type MobileRowConfig<T> = {
  primary: (row: T) => unknown;
  secondary?: Array<(row: T) => unknown>;
  meta?: Array<(row: T) => unknown>;
  actions?: (row: T) => unknown;
};

// ─── Feature config shapes ───

export type SortingConfig = {
  value?: SortingState;
  defaultValue?: SortingState;
  onChange?: (sorting: SortingState) => void;
  multiSort?: boolean;
};

export type FilteringConfig<T> = {
  value?: FilterState;
  defaultValue?: FilterState;
  onChange?: (filters: FilterState) => void;
  globalFilterFn?: (row: T, query: string) => boolean;
};

export type SelectionConfig = {
  value?: RowSelectionState;
  defaultValue?: RowSelectionState;
  onChange?: (selection: RowSelectionState) => void;
  mode?: 'single' | 'multi';
  isRowSelectable?: (row: unknown) => boolean;
};

export type ExpansionConfig = {
  value?: RowExpansionState;
  defaultValue?: RowExpansionState;
  onChange?: (expansion: RowExpansionState) => void;
};

export type PaginationConfig = {
  value?: PaginationState;
  defaultValue?: PaginationState;
  onChange?: (pagination: PaginationState) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
};

export type ColumnVisibilityConfig = {
  value?: ColumnVisibilityState;
  defaultValue?: ColumnVisibilityState;
  onChange?: (visibility: ColumnVisibilityState) => void;
};

export type ResponsiveConfig = {
  mode: 'auto' | 'table' | 'list';
  breakpoint?: number;
};

// ─── Factory options ───

export type DataTableOptions<T> = {
  data: () => T[];
  getRowId: (row: T) => string;
  columns: ColumnDef<T>[];

  sorting?: boolean | SortingConfig;
  filtering?: boolean | FilteringConfig<T>;
  selection?: boolean | SelectionConfig;
  expansion?: boolean | ExpansionConfig;
  pagination?: boolean | PaginationConfig;
  columnVisibility?: ColumnVisibilityConfig;

  manualSorting?: boolean;
  manualFiltering?: boolean;
  manualPagination?: boolean;
  totalRowCount?: number | (() => number);

  responsive?: ResponsiveConfig;
  mobileRow?: MobileRowConfig<T>;

  loading?: boolean;
  error?: boolean;
  id?: string;
};

// ─── Instance interface ───

export interface DataTableInstance<T> {
  readonly tableId: string;

  // Columns
  getColumns(): ResolvedColumnDef<T>[];
  getVisibleColumns(): ResolvedColumnDef<T>[];

  // Row models
  getRows(): DataTableRow<T>[];
  getFilteredRows(): DataTableRow<T>[];
  getSortedRows(): DataTableRow<T>[];
  getPageRows(): DataTableRow<T>[];
  getSelectedRows(): DataTableRow<T>[];
  getRow(rowId: string): DataTableRow<T> | undefined;

  // Sorting
  getSorting(): SortingState;
  setSorting(sorting: SortingState): void;
  toggleSort(columnId: string, opts?: { multi?: boolean }): void;
  clearSorting(): void;
  getColumnSortDirection(columnId: string): 'asc' | 'desc' | false;

  // Filtering
  getFilters(): FilterState;
  setFilters(filters: FilterState): void;
  getGlobalFilter(): string;
  setGlobalFilter(value: string): void;
  getColumnFilter(columnId: string): unknown;
  setColumnFilter(columnId: string, value: unknown): void;
  clearColumnFilter(columnId: string): void;
  clearFilters(): void;

  // Selection
  getSelection(): RowSelectionState;
  setSelection(selection: RowSelectionState): void;
  toggleRowSelection(rowId: string): void;
  toggleAllPageRowsSelection(): void;
  clearSelection(): void;
  isRowSelected(rowId: string): boolean;
  isAllPageRowsSelected(): boolean;
  isSomePageRowsSelected(): boolean;

  // Expansion
  getExpanded(): RowExpansionState;
  setExpanded(expansion: RowExpansionState): void;
  toggleRowExpansion(rowId: string): void;
  clearExpanded(): void;
  isRowExpanded(rowId: string): boolean;

  // Pagination
  getPagination(): PaginationState;
  setPagination(next: PaginationState): void;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  getPageCount(): number;
  getTotalRowCount(): number;
  canPreviousPage(): boolean;
  canNextPage(): boolean;
  previousPage(): void;
  nextPage(): void;

  // Column visibility
  getColumnVisibility(): ColumnVisibilityState;
  setColumnVisibility(next: ColumnVisibilityState): void;
  setColumnVisible(columnId: string, visible: boolean): void;
  toggleColumnVisibility(columnId: string): void;
  isColumnVisible(columnId: string): boolean;

  // Responsive
  getResponsiveMode(): 'table' | 'list';

  // Data state
  getDataState(): DataState;

  // Manual mode flags
  isManualSorting(): boolean;
  isManualFiltering(): boolean;
  isManualPagination(): boolean;
}

// ─── Component props ───

export type DataTableRootOwnProps<T> = {
  table: DataTableInstance<T>;
  children?: unknown;
  id?: string;
};

export type DataTableRootProps<T> = Omit<
  BoxProps<'div', HTMLDivElement>,
  'children' | 'id'
> &
  DataTableRootOwnProps<T>;

export type DataTableContentOwnProps = {
  children?: unknown;
};

export type DataTableContentProps = BoxProps<'div', HTMLDivElement> &
  DataTableContentOwnProps;

// Table view

export type DataTableTableViewOwnProps = {
  children?: unknown;
};

export type DataTableTableViewProps = Omit<
  BoxProps<'table', HTMLTableElement>,
  'children'
> &
  DataTableTableViewOwnProps;

export type DataTableTableHeaderProps = BoxProps<
  'thead',
  HTMLTableSectionElement
>;
export type DataTableTableHeaderAsChildProps = BoxAsChildProps;

export type DataTableTableBodyProps = BoxProps<
  'tbody',
  HTMLTableSectionElement
>;
export type DataTableTableBodyAsChildProps = BoxAsChildProps;

export type DataTableHeaderRowOwnProps = {
  children?: unknown;
};

export type DataTableHeaderRowProps = Omit<
  BoxProps<'tr', HTMLTableRowElement>,
  'children'
> &
  DataTableHeaderRowOwnProps;

export type DataTableHeadOwnProps = {
  children?: unknown;
  column?: ResolvedColumnDef<any>;
};

export type DataTableHeadProps = Omit<
  BoxProps<'th', HTMLTableCellElement>,
  'children'
> &
  DataTableHeadOwnProps;

export type DataTableRowOwnProps<T> = {
  children?: unknown;
  row: DataTableRow<T>;
};

export type DataTableRowProps<T> = Omit<
  BoxProps<'tr', HTMLTableRowElement>,
  'children'
> &
  DataTableRowOwnProps<T>;

export type DataTableCellOwnProps<T> = {
  children?: unknown;
  cell: DataTableCell<T>;
};

export type DataTableCellProps<T> = Omit<
  BoxProps<'td', HTMLTableCellElement>,
  'children'
> &
  DataTableCellOwnProps<T>;

export type DataTableExpandedRowOwnProps<T> = {
  children?: unknown;
  row: DataTableRow<T>;
};

export type DataTableExpandedRowProps<T> = Omit<
  BoxProps<'tr', HTMLTableRowElement>,
  'children'
> &
  DataTableExpandedRowOwnProps<T>;

// List view

export type DataTableListViewOwnProps = {
  children?: unknown;
};

export type DataTableListViewProps = Omit<
  BoxProps<'ul', HTMLUListElement>,
  'children'
> &
  DataTableListViewOwnProps;

export type DataTableListItemOwnProps<T> = {
  children?: unknown;
  row: DataTableRow<T>;
};

export type DataTableListItemProps<T> = Omit<
  BoxProps<'li', HTMLLIElement>,
  'children'
> &
  DataTableListItemOwnProps<T>;

export type DataTableListMainProps = BoxProps<'div', HTMLDivElement>;
export type DataTableListMetaProps = BoxProps<'div', HTMLDivElement>;
export type DataTableListActionsProps = BoxProps<'div', HTMLDivElement>;
export type DataTableListExpandedProps = BoxProps<'div', HTMLDivElement>;

// Toolbar

export type DataTableToolbarOwnProps = {
  children?: unknown;
};

export type DataTableToolbarProps = BoxProps<'div', HTMLDivElement> &
  DataTableToolbarOwnProps;

export type DataTableSearchOwnProps = {
  placeholder?: string;
  debounceMs?: number;
};

export type DataTableSearchProps = Omit<
  BoxProps<'input', HTMLInputElement>,
  'type'
> &
  DataTableSearchOwnProps;

// Pagination

export type DataTablePaginationOwnProps = {
  children?: unknown;
};

export type DataTablePaginationProps = BoxProps<'nav', HTMLElement> &
  DataTablePaginationOwnProps;

// State display

export type DataTableEmptyOwnProps = {
  children?: unknown;
};

export type DataTableEmptyProps = BoxProps<'div', HTMLDivElement> &
  DataTableEmptyOwnProps;

export type DataTableLoadingOwnProps = {
  children?: unknown;
};

export type DataTableLoadingProps = BoxProps<'div', HTMLDivElement> &
  DataTableLoadingOwnProps;

export type DataTableErrorOwnProps = {
  children?: unknown;
};

export type DataTableErrorProps = BoxProps<'div', HTMLDivElement> &
  DataTableErrorOwnProps;

// ─── Injected props (internal) ───

export type InjectedDataTableProps<T> = {
  __table?: DataTableInstance<T>;
  __tableId?: string;
};
