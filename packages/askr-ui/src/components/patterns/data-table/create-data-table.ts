import { controllableState } from '@askrjs/askr/foundations';
import { resolveCompoundId } from '../../_internal/id';
import {
  applyFilters,
  applyPagination,
  applySorting,
  clampPage,
  computePageCount,
  deriveDataState,
  getVisibleColumns,
  resolveColumns,
  resolveExpansionConfig,
  resolveFilteringConfig,
  resolvePaginationConfig,
  resolveSelectionConfig,
  resolveSortingConfig,
  toggleSortDescriptor,
} from '../../_internal/data-table';
import type {
  ColumnDef,
  ColumnVisibilityState,
  DataTableCell,
  DataTableInstance,
  DataTableOptions,
  DataTableRow,
  DataState,
  FilterState,
  MobileRowConfig,
  PaginationState,
  ResolvedColumnDef,
  RowExpansionState,
  RowSelectionState,
  SortingState,
} from './data-table.types';

export function column<T>(def: ColumnDef<T>): ColumnDef<T> {
  return def;
}

function createRowModel<T>(
  row: T,
  index: number,
  rowId: string,
  visibleColumns: () => ResolvedColumnDef<T>[],
  allColumns: ResolvedColumnDef<T>[],
  selectionState: () => RowSelectionState,
  expansionState: () => RowExpansionState,
  toggleSelection: (id: string) => void,
  toggleExpansion: (id: string) => void,
  isSelectable: (row: T) => boolean,
  mobileRow?: MobileRowConfig<T>
): DataTableRow<T> {
  const rowModel: DataTableRow<T> = {
    id: rowId,
    index,
    original: row,

    getVisibleCells(): DataTableCell<T>[] {
      return visibleColumns().map((col) => createCellModel(row, rowModel, col));
    },

    getCellValue(columnId: string): unknown {
      const col = allColumns.find((c) => c.id === columnId);

      return col ? col.accessor(row) : undefined;
    },

    isSelected(): boolean {
      return selectionState()[rowId] === true;
    },

    isExpanded(): boolean {
      return expansionState()[rowId] === true;
    },

    isSelectable(): boolean {
      return isSelectable(row);
    },

    toggleSelected(): void {
      toggleSelection(rowId);
    },

    toggleExpanded(): void {
      toggleExpansion(rowId);
    },

    getListPrimary(): unknown {
      if (mobileRow?.primary) {
        return mobileRow.primary(row);
      }

      const priorityCols = [...visibleColumns()]
        .filter((c) => c.mobile?.priority != null)
        .sort((a, b) => a.mobile!.priority! - b.mobile!.priority!);

      const primaryCol = priorityCols[0] ?? visibleColumns()[0];

      return primaryCol ? primaryCol.accessor(row) : undefined;
    },

    getListSecondary(): unknown[] {
      if (mobileRow?.secondary) {
        return mobileRow.secondary.map((fn) => fn(row));
      }

      const priorityCols = [...visibleColumns()]
        .filter((c) => c.mobile?.priority != null && !c.mobile?.hidden)
        .sort((a, b) => a.mobile!.priority! - b.mobile!.priority!);

      return priorityCols.slice(1, 4).map((col) => col.accessor(row));
    },

    getListMeta(): unknown[] {
      if (mobileRow?.meta) {
        return mobileRow.meta.map((fn) => fn(row));
      }

      return [];
    },

    getListActions(): unknown {
      if (mobileRow?.actions) {
        return mobileRow.actions(row);
      }

      return undefined;
    },
  };

  return rowModel;
}

function createCellModel<T>(
  row: T,
  rowModel: DataTableRow<T>,
  column: ResolvedColumnDef<T>
): DataTableCell<T> {
  return {
    id: `${rowModel.id}_${column.id}`,
    column,
    row: rowModel,

    getValue(): unknown {
      return column.accessor(row);
    },

    renderValue(): unknown {
      const value = column.accessor(row);

      if (column.cell) {
        return column.cell({ value, row: rowModel });
      }

      return String(value ?? '');
    },
  };
}

export function createDataTable<T>(
  options: DataTableOptions<T>
): DataTableInstance<T> {
  const tableId = resolveCompoundId(
    'data-table',
    options.id,
    options.columns.length
  );

  // Resolve feature configs
  const sortingConfig = resolveSortingConfig(options.sorting);
  const filteringConfig = resolveFilteringConfig(options.filtering);
  const selectionConfig = resolveSelectionConfig(options.selection);
  const expansionConfig = resolveExpansionConfig(options.expansion);
  const paginationConfig = resolvePaginationConfig(options.pagination);

  // Create controllable state slices
  const sortingState = controllableState({
    value: sortingConfig.value,
    defaultValue: sortingConfig.defaultValue,
    onChange: sortingConfig.onChange,
  });

  const filterState = controllableState({
    value: filteringConfig.value,
    defaultValue: filteringConfig.defaultValue,
    onChange: filteringConfig.onChange,
  });

  const selectionState = controllableState({
    value: selectionConfig.value,
    defaultValue: selectionConfig.defaultValue,
    onChange: selectionConfig.onChange,
  });

  const expansionState = controllableState({
    value: expansionConfig.value,
    defaultValue: expansionConfig.defaultValue,
    onChange: expansionConfig.onChange,
  });

  const paginationState = controllableState({
    value: paginationConfig.value,
    defaultValue: paginationConfig.defaultValue,
    onChange: paginationConfig.onChange,
  });

  const visibilityDefault: ColumnVisibilityState =
    options.columnVisibility?.defaultValue ?? {};

  const visibilityState = controllableState({
    value: options.columnVisibility?.value,
    defaultValue: visibilityDefault,
    onChange: options.columnVisibility?.onChange,
  });

  // Resolve columns once
  const resolvedColumns = resolveColumns(options.columns);

  // Helper: is a row selectable
  const isRowSelectable = (row: T): boolean => {
    if (!selectionConfig.enabled) {
      return false;
    }

    if (selectionConfig.isRowSelectable) {
      return selectionConfig.isRowSelectable(row);
    }

    return true;
  };

  // Helper: get visible columns
  const computeVisibleColumns = (): ResolvedColumnDef<T>[] =>
    getVisibleColumns(resolvedColumns, visibilityState());

  // Helper: toggle selection for a row
  const doToggleRowSelection = (rowId: string): void => {
    const current = selectionState();

    if (selectionConfig.mode === 'single') {
      if (current[rowId]) {
        selectionState.set({});
      } else {
        selectionState.set({ [rowId]: true });
      }
    } else {
      const next = { ...current };

      if (next[rowId]) {
        delete next[rowId];
      } else {
        next[rowId] = true;
      }

      selectionState.set(next);
    }
  };

  // Helper: toggle expansion for a row
  const doToggleRowExpansion = (rowId: string): void => {
    const current = expansionState();
    const next = { ...current };

    if (next[rowId]) {
      delete next[rowId];
    } else {
      next[rowId] = true;
    }

    expansionState.set(next);
  };

  // Data pipeline: rows → filtered → sorted → paginated
  const buildRowModels = (
    sourceRows: T[],
    startIndex: number
  ): DataTableRow<T>[] =>
    sourceRows.map((row, i) =>
      createRowModel(
        row,
        startIndex + i,
        options.getRowId(row),
        computeVisibleColumns,
        resolvedColumns,
        () => selectionState(),
        () => expansionState(),
        doToggleRowSelection,
        doToggleRowExpansion,
        isRowSelectable,
        options.mobileRow
      )
    );

  // Build the instance
  const instance: DataTableInstance<T> = {
    tableId,

    // ─── Columns ───

    getColumns(): ResolvedColumnDef<T>[] {
      return resolvedColumns;
    },

    getVisibleColumns(): ResolvedColumnDef<T>[] {
      return computeVisibleColumns();
    },

    // ─── Row models ───

    getRows(): DataTableRow<T>[] {
      return buildRowModels(options.data(), 0);
    },

    getFilteredRows(): DataTableRow<T>[] {
      const data = options.data();

      if (options.manualFiltering || !filteringConfig.enabled) {
        return buildRowModels(data, 0);
      }

      const filtered = applyFilters(
        data,
        filterState(),
        resolvedColumns,
        filteringConfig.globalFilterFn
      );

      return buildRowModels(filtered, 0);
    },

    getSortedRows(): DataTableRow<T>[] {
      const data = options.data();
      let rows = data;

      if (!options.manualFiltering && filteringConfig.enabled) {
        rows = applyFilters(
          rows,
          filterState(),
          resolvedColumns,
          filteringConfig.globalFilterFn
        );
      }

      if (!options.manualSorting && sortingConfig.enabled) {
        rows = applySorting(rows, sortingState(), resolvedColumns);
      }

      return buildRowModels(rows, 0);
    },

    getPageRows(): DataTableRow<T>[] {
      const data = options.data();
      let rows = data;

      if (!options.manualFiltering && filteringConfig.enabled) {
        rows = applyFilters(
          rows,
          filterState(),
          resolvedColumns,
          filteringConfig.globalFilterFn
        );
      }

      if (!options.manualSorting && sortingConfig.enabled) {
        rows = applySorting(rows, sortingState(), resolvedColumns);
      }

      if (!options.manualPagination && paginationConfig.enabled) {
        rows = applyPagination(rows, paginationState());
      }

      return buildRowModels(rows, 0);
    },

    getSelectedRows(): DataTableRow<T>[] {
      const selection = selectionState();
      const data = options.data();
      const selected = data.filter(
        (row) => selection[options.getRowId(row)] === true
      );

      return buildRowModels(selected, 0);
    },

    getRow(rowId: string): DataTableRow<T> | undefined {
      const data = options.data();
      const rowIndex = data.findIndex((row) => options.getRowId(row) === rowId);

      if (rowIndex === -1) {
        return undefined;
      }

      return createRowModel(
        data[rowIndex],
        rowIndex,
        rowId,
        computeVisibleColumns,
        resolvedColumns,
        () => selectionState(),
        () => expansionState(),
        doToggleRowSelection,
        doToggleRowExpansion,
        isRowSelectable,
        options.mobileRow
      );
    },

    // ─── Sorting ───

    getSorting(): SortingState {
      return sortingState();
    },

    setSorting(sorting: SortingState): void {
      sortingState.set(sorting);
    },

    toggleSort(columnId: string, opts?: { multi?: boolean }): void {
      const multi = (opts?.multi && sortingConfig.multiSort) ?? false;
      const next = toggleSortDescriptor(sortingState(), columnId, multi);

      sortingState.set(next);
    },

    clearSorting(): void {
      sortingState.set([]);
    },

    getColumnSortDirection(columnId: string): 'asc' | 'desc' | false {
      const descriptor = sortingState().find((s) => s.id === columnId);

      if (!descriptor) {
        return false;
      }

      return descriptor.desc ? 'desc' : 'asc';
    },

    // ─── Filtering ───

    getFilters(): FilterState {
      return filterState();
    },

    setFilters(filters: FilterState): void {
      filterState.set(filters);
    },

    getGlobalFilter(): string {
      return filterState().global;
    },

    setGlobalFilter(value: string): void {
      const current = filterState();

      filterState.set({ ...current, global: value });
    },

    getColumnFilter(columnId: string): unknown {
      return filterState().columns[columnId];
    },

    setColumnFilter(columnId: string, value: unknown): void {
      const current = filterState();

      filterState.set({
        ...current,
        columns: { ...current.columns, [columnId]: value },
      });
    },

    clearColumnFilter(columnId: string): void {
      const current = filterState();
      const columns = { ...current.columns };

      delete columns[columnId];
      filterState.set({ ...current, columns });
    },

    clearFilters(): void {
      filterState.set({ global: '', columns: {} });
    },

    // ─── Selection ───

    getSelection(): RowSelectionState {
      return selectionState();
    },

    setSelection(selection: RowSelectionState): void {
      selectionState.set(selection);
    },

    toggleRowSelection(rowId: string): void {
      doToggleRowSelection(rowId);
    },

    toggleAllPageRowsSelection(): void {
      const pageRows = instance.getPageRows();
      const current = selectionState();
      const allSelected = pageRows.every(
        (row) => current[row.id] === true || !row.isSelectable()
      );

      if (allSelected) {
        const next = { ...current };

        for (const row of pageRows) {
          delete next[row.id];
        }

        selectionState.set(next);
      } else {
        const next = { ...current };

        for (const row of pageRows) {
          if (row.isSelectable()) {
            next[row.id] = true;
          }
        }

        selectionState.set(next);
      }
    },

    clearSelection(): void {
      selectionState.set({});
    },

    isRowSelected(rowId: string): boolean {
      return selectionState()[rowId] === true;
    },

    isAllPageRowsSelected(): boolean {
      const pageRows = instance.getPageRows();
      const selectableRows = pageRows.filter((row) => row.isSelectable());

      if (selectableRows.length === 0) {
        return false;
      }

      const current = selectionState();

      return selectableRows.every((row) => current[row.id] === true);
    },

    isSomePageRowsSelected(): boolean {
      const pageRows = instance.getPageRows();
      const current = selectionState();
      const selectedCount = pageRows.filter(
        (row) => current[row.id] === true
      ).length;

      return selectedCount > 0 && !instance.isAllPageRowsSelected();
    },

    // ─── Expansion ───

    getExpanded(): RowExpansionState {
      return expansionState();
    },

    setExpanded(expansion: RowExpansionState): void {
      expansionState.set(expansion);
    },

    toggleRowExpansion(rowId: string): void {
      doToggleRowExpansion(rowId);
    },

    clearExpanded(): void {
      expansionState.set({});
    },

    isRowExpanded(rowId: string): boolean {
      return expansionState()[rowId] === true;
    },

    // ─── Pagination ───

    getPagination(): PaginationState {
      return paginationState();
    },

    setPagination(next: PaginationState): void {
      paginationState.set(next);
    },

    setPage(page: number): void {
      const current = paginationState();
      const pageCount = instance.getPageCount();

      paginationState.set({
        ...current,
        page: clampPage(page, pageCount),
      });
    },

    setPageSize(pageSize: number): void {
      const current = paginationState();

      paginationState.set({ ...current, pageSize, page: 1 });
    },

    getPageCount(): number {
      const total = instance.getTotalRowCount();
      const { pageSize } = paginationState();

      return computePageCount(total, pageSize);
    },

    getTotalRowCount(): number {
      if (options.totalRowCount != null) {
        return typeof options.totalRowCount === 'function'
          ? options.totalRowCount()
          : options.totalRowCount;
      }

      if (options.manualFiltering || !filteringConfig.enabled) {
        return options.data().length;
      }

      return applyFilters(
        options.data(),
        filterState(),
        resolvedColumns,
        filteringConfig.globalFilterFn
      ).length;
    },

    canPreviousPage(): boolean {
      return paginationState().page > 1;
    },

    canNextPage(): boolean {
      return paginationState().page < instance.getPageCount();
    },

    previousPage(): void {
      const current = paginationState();

      if (current.page > 1) {
        paginationState.set({ ...current, page: current.page - 1 });
      }
    },

    nextPage(): void {
      const current = paginationState();
      const pageCount = instance.getPageCount();

      if (current.page < pageCount) {
        paginationState.set({ ...current, page: current.page + 1 });
      }
    },

    // ─── Column Visibility ───

    getColumnVisibility(): ColumnVisibilityState {
      return visibilityState();
    },

    setColumnVisibility(next: ColumnVisibilityState): void {
      visibilityState.set(next);
    },

    setColumnVisible(columnId: string, visible: boolean): void {
      const current = visibilityState();

      visibilityState.set({ ...current, [columnId]: visible });
    },

    toggleColumnVisibility(columnId: string): void {
      const current = visibilityState();
      const isVisible = instance.isColumnVisible(columnId);

      visibilityState.set({ ...current, [columnId]: !isVisible });
    },

    isColumnVisible(columnId: string): boolean {
      const visibility = visibilityState();

      if (columnId in visibility) {
        return visibility[columnId];
      }

      const col = resolvedColumns.find((c) => c.id === columnId);

      return col?.defaultVisible !== false;
    },

    // ─── Responsive ───

    getResponsiveMode(): 'table' | 'list' {
      const config = options.responsive;

      if (!config || config.mode === 'table') {
        return 'table';
      }

      if (config.mode === 'list') {
        return 'list';
      }

      // auto mode: use matchMedia if available and breakpoint is set
      if (config.breakpoint && typeof globalThis.matchMedia === 'function') {
        const mql = globalThis.matchMedia(
          `(min-width: ${config.breakpoint}px)`
        );

        return mql.matches ? 'table' : 'list';
      }

      return 'table';
    },

    // ─── Data State ───

    getDataState(): DataState {
      const loading = options.loading ?? false;
      const error = options.error ?? false;
      const data = options.data();

      if (options.manualFiltering || !filteringConfig.enabled) {
        return deriveDataState(loading, error, data.length, data.length);
      }

      const filtered = applyFilters(
        data,
        filterState(),
        resolvedColumns,
        filteringConfig.globalFilterFn
      ).length;

      return deriveDataState(loading, error, data.length, filtered);
    },

    // ─── Manual Mode Flags ───

    isManualSorting(): boolean {
      return options.manualSorting ?? false;
    },

    isManualFiltering(): boolean {
      return options.manualFiltering ?? false;
    },

    isManualPagination(): boolean {
      return options.manualPagination ?? false;
    },
  };

  return instance;
}
