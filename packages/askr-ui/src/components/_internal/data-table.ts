import type {
  ColumnDef,
  ColumnVisibilityState,
  DataState,
  ExpansionConfig,
  FilteringConfig,
  FilterState,
  PaginationConfig,
  PaginationState,
  ResolvedColumnDef,
  RowExpansionState,
  RowSelectionState,
  SelectionConfig,
  SortDescriptor,
  SortingConfig,
  SortingState,
} from '../patterns/data-table/data-table.types';

// ─── Feature config resolution ───

export type ResolvedFeatureConfig<TValue> = {
  enabled: boolean;
  value?: TValue;
  defaultValue: TValue;
  onChange?: (value: TValue) => void;
};

export function resolveSortingConfig(
  config: boolean | SortingConfig | undefined
): ResolvedFeatureConfig<SortingState> & { multiSort: boolean } {
  if (config === false || config === undefined) {
    return { enabled: false, defaultValue: [], multiSort: false };
  }

  if (config === true) {
    return { enabled: true, defaultValue: [], multiSort: false };
  }

  return {
    enabled: true,
    value: config.value,
    defaultValue: config.defaultValue ?? [],
    onChange: config.onChange,
    multiSort: config.multiSort ?? false,
  };
}

export function resolveFilteringConfig<T>(
  config: boolean | FilteringConfig<T> | undefined
): ResolvedFeatureConfig<FilterState> & {
  globalFilterFn?: (row: T, query: string) => boolean;
} {
  const defaultFilter: FilterState = { global: '', columns: {} };

  if (config === false || config === undefined) {
    return { enabled: false, defaultValue: defaultFilter };
  }

  if (config === true) {
    return { enabled: true, defaultValue: defaultFilter };
  }

  return {
    enabled: true,
    value: config.value,
    defaultValue: config.defaultValue ?? defaultFilter,
    onChange: config.onChange,
    globalFilterFn: config.globalFilterFn,
  };
}

export function resolveSelectionConfig(
  config: boolean | SelectionConfig | undefined
): ResolvedFeatureConfig<RowSelectionState> & {
  mode: 'single' | 'multi';
  isRowSelectable?: (row: unknown) => boolean;
} {
  if (config === false || config === undefined) {
    return { enabled: false, defaultValue: {}, mode: 'multi' };
  }

  if (config === true) {
    return { enabled: true, defaultValue: {}, mode: 'multi' };
  }

  return {
    enabled: true,
    value: config.value,
    defaultValue: config.defaultValue ?? {},
    onChange: config.onChange,
    mode: config.mode ?? 'multi',
    isRowSelectable: config.isRowSelectable,
  };
}

export function resolveExpansionConfig(
  config: boolean | ExpansionConfig | undefined
): ResolvedFeatureConfig<RowExpansionState> {
  if (config === false || config === undefined) {
    return { enabled: false, defaultValue: {} };
  }

  if (config === true) {
    return { enabled: true, defaultValue: {} };
  }

  return {
    enabled: true,
    value: config.value,
    defaultValue: config.defaultValue ?? {},
    onChange: config.onChange,
  };
}

export function resolvePaginationConfig(
  config: boolean | PaginationConfig | undefined
): ResolvedFeatureConfig<PaginationState> & {
  pageSizeOptions: number[];
} {
  const defaultPageSize = 20;
  const defaultPagination: PaginationState = {
    page: 1,
    pageSize: defaultPageSize,
  };

  if (config === false || config === undefined) {
    return {
      enabled: false,
      defaultValue: defaultPagination,
      pageSizeOptions: [10, 20, 50, 100],
    };
  }

  if (config === true) {
    return {
      enabled: true,
      defaultValue: defaultPagination,
      pageSizeOptions: [10, 20, 50, 100],
    };
  }

  const pageSize = config.pageSize ?? defaultPageSize;

  return {
    enabled: true,
    value: config.value,
    defaultValue: config.defaultValue ?? { page: 1, pageSize },
    onChange: config.onChange,
    pageSizeOptions: config.pageSizeOptions ?? [10, 20, 50, 100],
  };
}

// ─── Column resolution ───

export function resolveColumns<T>(
  columns: ColumnDef<T>[]
): ResolvedColumnDef<T>[] {
  return columns.map((col) => ({
    ...col,
    id: col.id,
    header: col.header,
    accessor: col.accessor,
  }));
}

export function getVisibleColumns<T>(
  columns: ResolvedColumnDef<T>[],
  visibility: ColumnVisibilityState
): ResolvedColumnDef<T>[] {
  return columns.filter((col) => {
    if (col.id in visibility) {
      return visibility[col.id];
    }

    return col.defaultVisible !== false;
  });
}

// ─── Sorting ───

export function defaultSortFn(a: unknown, b: unknown): number {
  const aStr = String(a ?? '');
  const bStr = String(b ?? '');

  return aStr.localeCompare(bStr);
}

export function applySorting<T>(
  rows: T[],
  sorting: SortingState,
  columns: ResolvedColumnDef<T>[]
): T[] {
  if (sorting.length === 0) {
    return rows;
  }

  const columnMap = new Map(columns.map((col) => [col.id, col]));

  return [...rows].sort((a, b) => {
    for (const descriptor of sorting) {
      const col = columnMap.get(descriptor.id);

      if (!col) {
        continue;
      }

      const aVal = col.accessor(a);
      const bVal = col.accessor(b);
      const sortFn = col.sortFn
        ? (x: T, y: T) => col.sortFn!(x, y, col.id)
        : () => defaultSortFn(aVal, bVal);
      const result = sortFn(a, b);

      if (result !== 0) {
        return descriptor.desc ? -result : result;
      }
    }

    return 0;
  });
}

// ─── Filtering ───

export function defaultGlobalFilterFn<T>(
  row: T,
  query: string,
  columns: ResolvedColumnDef<T>[]
): boolean {
  const lowerQuery = query.toLowerCase();

  return columns.some((col) => {
    const value = col.accessor(row);

    return String(value ?? '')
      .toLowerCase()
      .includes(lowerQuery);
  });
}

export function applyFilters<T>(
  rows: T[],
  filters: FilterState,
  columns: ResolvedColumnDef<T>[],
  globalFilterFn?: (row: T, query: string) => boolean
): T[] {
  let filtered = rows;

  if (filters.global) {
    const gFn = globalFilterFn
      ? (row: T) => globalFilterFn(row, filters.global)
      : (row: T) => defaultGlobalFilterFn(row, filters.global, columns);

    filtered = filtered.filter(gFn);
  }

  const columnMap = new Map(columns.map((col) => [col.id, col]));

  for (const [columnId, filterValue] of Object.entries(filters.columns)) {
    if (
      filterValue === undefined ||
      filterValue === null ||
      filterValue === ''
    ) {
      continue;
    }

    const col = columnMap.get(columnId);

    if (!col) {
      continue;
    }

    if (col.filterFn) {
      filtered = filtered.filter((row) =>
        col.filterFn!(row, columnId, filterValue)
      );
    } else {
      const lowerFilter = String(filterValue).toLowerCase();

      filtered = filtered.filter((row) => {
        const value = col.accessor(row);

        return String(value ?? '')
          .toLowerCase()
          .includes(lowerFilter);
      });
    }
  }

  return filtered;
}

// ─── Pagination ───

export function applyPagination<T>(
  rows: T[],
  pagination: PaginationState
): T[] {
  const start = (pagination.page - 1) * pagination.pageSize;

  return rows.slice(start, start + pagination.pageSize);
}

export function computePageCount(totalRows: number, pageSize: number): number {
  if (totalRows <= 0 || pageSize <= 0) {
    return 1;
  }

  return Math.ceil(totalRows / pageSize);
}

export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(page, 1), Math.max(pageCount, 1));
}

// ─── Sorting state helpers ───

export function toggleSortDescriptor(
  current: SortingState,
  columnId: string,
  multi: boolean
): SortingState {
  const existing = current.find((s) => s.id === columnId);

  if (!existing) {
    const newDescriptor: SortDescriptor = { id: columnId, desc: false };

    return multi ? [...current, newDescriptor] : [newDescriptor];
  }

  if (!existing.desc) {
    const updated = current.map((s) =>
      s.id === columnId ? { ...s, desc: true } : s
    );

    return multi ? updated : [{ id: columnId, desc: true }];
  }

  const removed = current.filter((s) => s.id !== columnId);

  return multi ? removed : [];
}

// ─── Data state derivation ───

export function deriveDataState(
  loading: boolean,
  error: boolean,
  totalRows: number,
  filteredRows: number
): DataState {
  if (error) {
    return 'error';
  }

  if (loading) {
    return 'loading';
  }

  if (totalRows === 0) {
    return 'empty';
  }

  if (filteredRows === 0) {
    return 'filtered-empty';
  }

  return 'idle';
}
