import { describe, expect, it } from 'vite-plus/test';
import {
  createDataTable,
  column,
} from '../../../src/components/patterns/data-table/create-data-table';
import type { DataTableInstance } from '../../../src/components/patterns/data-table/data-table.types';
import { mount, unmount } from '../../test-utils';

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  age: number;
};

const users: User[] = [
  {
    id: '1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'admin',
    age: 30,
  },
  { id: '2', name: 'Bob', email: 'bob@example.com', role: 'user', age: 25 },
  {
    id: '3',
    name: 'Charlie',
    email: 'charlie@example.com',
    role: 'user',
    age: 35,
  },
  {
    id: '4',
    name: 'Diana',
    email: 'diana@example.com',
    role: 'admin',
    age: 28,
  },
  { id: '5', name: 'Eve', email: 'eve@example.com', role: 'user', age: 22 },
];

const baseColumns = [
  column<User>({
    id: 'name',
    header: 'Name',
    accessor: (row) => row.name,
    sortable: true,
    filterable: true,
    mobile: { priority: 1 },
  }),
  column<User>({
    id: 'email',
    header: 'Email',
    accessor: (row) => row.email,
    sortable: true,
    mobile: { priority: 2 },
  }),
  column<User>({
    id: 'role',
    header: 'Role',
    accessor: (row) => row.role,
    filterable: true,
    mobile: { priority: 3 },
  }),
  column<User>({
    id: 'age',
    header: 'Age',
    accessor: (row) => row.age,
    sortable: true,
  }),
];

// controllableState is a render-scoped hook — createDataTable must be called
// inside a component render function. Read-only assertions run in render.
// For mutations, we capture the instance and mutate after mount.
function createTableInContext(
  overrides: Partial<Parameters<typeof createDataTable<User>>[0]> = {}
): { table: DataTableInstance<User>; cleanup: () => void } {
  let tableRef: DataTableInstance<User> = undefined!;

  function TestComponent() {
    tableRef = createDataTable<User>({
      data: () => users,
      getRowId: (row) => row.id,
      columns: baseColumns,
      ...overrides,
    });

    return <div />;
  }

  const container = mount(<TestComponent />);

  return {
    table: tableRef,
    cleanup: () => unmount(container),
  };
}

describe('createDataTable - Core', () => {
  it('should create an instance with a tableId', () => {
    const { table, cleanup } = createTableInContext();

    try {
      expect(table.tableId).toBeTruthy();
      expect(typeof table.tableId).toBe('string');
    } finally {
      cleanup();
    }
  });

  it('should resolve columns', () => {
    const { table, cleanup } = createTableInContext();

    try {
      expect(table.getColumns()).toHaveLength(4);
      expect(table.getColumns()[0].id).toBe('name');
      expect(table.getColumns()[1].id).toBe('email');
    } finally {
      cleanup();
    }
  });

  it('should return all rows as row models', () => {
    const { table, cleanup } = createTableInContext();

    try {
      const rows = table.getRows();

      expect(rows).toHaveLength(5);
      expect(rows[0].id).toBe('1');
      expect(rows[0].original).toBe(users[0]);
      expect(rows[0].index).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('should provide cell access on row models', () => {
    const { table, cleanup } = createTableInContext();

    try {
      const row = table.getPageRows()[0];
      const cells = row.getVisibleCells();

      expect(cells).toHaveLength(4);
      expect(cells[0].getValue()).toBe('Alice');
      expect(cells[0].id).toBe('1_name');
      expect(cells[0].column.id).toBe('name');
    } finally {
      cleanup();
    }
  });

  it('should support getCellValue by column id', () => {
    const { table, cleanup } = createTableInContext();

    try {
      const row = table.getPageRows()[0];

      expect(row.getCellValue('name')).toBe('Alice');
      expect(row.getCellValue('email')).toBe('alice@example.com');
      expect(row.getCellValue('nonexistent')).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('should support getRow by id', () => {
    const { table, cleanup } = createTableInContext();

    try {
      const row = table.getRow('3');

      expect(row).toBeDefined();
      expect(row!.original.name).toBe('Charlie');
      expect(table.getRow('nonexistent')).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Sorting', () => {
  it('should start with empty sorting state', () => {
    const { table, cleanup } = createTableInContext({ sorting: true });

    try {
      expect(table.getSorting()).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('should toggle sort: none → asc → desc → none', () => {
    const { table, cleanup } = createTableInContext({ sorting: true });

    try {
      expect(table.getColumnSortDirection('name')).toBe(false);

      table.toggleSort('name');
      expect(table.getColumnSortDirection('name')).toBe('asc');

      table.toggleSort('name');
      expect(table.getColumnSortDirection('name')).toBe('desc');

      table.toggleSort('name');
      expect(table.getColumnSortDirection('name')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('should sort rows ascending', () => {
    const { table, cleanup } = createTableInContext({ sorting: true });

    try {
      table.setSorting([{ id: 'name', desc: false }]);
      const rows = table.getSortedRows();

      expect(rows[0].original.name).toBe('Alice');
      expect(rows[4].original.name).toBe('Eve');
    } finally {
      cleanup();
    }
  });

  it('should sort rows descending', () => {
    const { table, cleanup } = createTableInContext({ sorting: true });

    try {
      table.setSorting([{ id: 'name', desc: true }]);
      const rows = table.getSortedRows();

      expect(rows[0].original.name).toBe('Eve');
      expect(rows[4].original.name).toBe('Alice');
    } finally {
      cleanup();
    }
  });

  it('should clear sorting', () => {
    const { table, cleanup } = createTableInContext({ sorting: true });

    try {
      table.setSorting([{ id: 'name', desc: false }]);
      table.clearSorting();

      expect(table.getSorting()).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('should support multi-sort with { multi: true }', () => {
    const { table, cleanup } = createTableInContext({
      sorting: { multiSort: true },
    });

    try {
      table.toggleSort('role');
      table.toggleSort('name', { multi: true });

      expect(table.getSorting()).toEqual([
        { id: 'role', desc: false },
        { id: 'name', desc: false },
      ]);
    } finally {
      cleanup();
    }
  });

  it('should ignore multi flag when multiSort is disabled', () => {
    const { table, cleanup } = createTableInContext({ sorting: true });

    try {
      table.toggleSort('role');
      table.toggleSort('name', { multi: true });

      expect(table.getSorting()).toEqual([{ id: 'name', desc: false }]);
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Filtering', () => {
  it('should start with empty filters', () => {
    const { table, cleanup } = createTableInContext({ filtering: true });

    try {
      expect(table.getFilters()).toEqual({ global: '', columns: {} });
      expect(table.getGlobalFilter()).toBe('');
    } finally {
      cleanup();
    }
  });

  it('should filter by global search', () => {
    const { table, cleanup } = createTableInContext({ filtering: true });

    try {
      table.setGlobalFilter('alice');
      const rows = table.getFilteredRows();

      expect(rows).toHaveLength(1);
      expect(rows[0].original.name).toBe('Alice');
    } finally {
      cleanup();
    }
  });

  it('should filter by column', () => {
    const { table, cleanup } = createTableInContext({ filtering: true });

    try {
      table.setColumnFilter('role', 'admin');
      const rows = table.getFilteredRows();

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.original.role === 'admin')).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('should clear column filter', () => {
    const { table, cleanup } = createTableInContext({ filtering: true });

    try {
      table.setColumnFilter('role', 'admin');
      expect(table.getFilteredRows()).toHaveLength(2);

      table.clearColumnFilter('role');
      expect(table.getFilteredRows()).toHaveLength(5);
    } finally {
      cleanup();
    }
  });

  it('should clear all filters', () => {
    const { table, cleanup } = createTableInContext({ filtering: true });

    try {
      table.setGlobalFilter('a');
      table.setColumnFilter('role', 'admin');
      table.clearFilters();

      expect(table.getGlobalFilter()).toBe('');
      expect(table.getFilters().columns).toEqual({});
      expect(table.getFilteredRows()).toHaveLength(5);
    } finally {
      cleanup();
    }
  });

  it('should use custom globalFilterFn', () => {
    const { table, cleanup } = createTableInContext({
      filtering: {
        globalFilterFn: (row, query) =>
          row.role.toLowerCase() === query.toLowerCase(),
      },
    });

    try {
      table.setGlobalFilter('admin');
      const rows = table.getFilteredRows();

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.original.role === 'admin')).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Selection', () => {
  it('should start with empty selection', () => {
    const { table, cleanup } = createTableInContext({ selection: true });

    try {
      expect(table.getSelection()).toEqual({});
      expect(table.isRowSelected('1')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('should toggle row selection', () => {
    const { table, cleanup } = createTableInContext({ selection: true });

    try {
      table.toggleRowSelection('1');
      expect(table.isRowSelected('1')).toBe(true);

      table.toggleRowSelection('1');
      expect(table.isRowSelected('1')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('should support multi-select', () => {
    const { table, cleanup } = createTableInContext({
      selection: { mode: 'multi' },
    });

    try {
      table.toggleRowSelection('1');
      table.toggleRowSelection('3');

      expect(table.isRowSelected('1')).toBe(true);
      expect(table.isRowSelected('3')).toBe(true);
      expect(table.getSelectedRows()).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it('should support single-select', () => {
    const { table, cleanup } = createTableInContext({
      selection: { mode: 'single' },
    });

    try {
      table.toggleRowSelection('1');
      expect(table.isRowSelected('1')).toBe(true);

      table.toggleRowSelection('3');
      expect(table.isRowSelected('1')).toBe(false);
      expect(table.isRowSelected('3')).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('should toggle all page rows', () => {
    const { table, cleanup } = createTableInContext({ selection: true });

    try {
      table.toggleAllPageRowsSelection();
      expect(table.isAllPageRowsSelected()).toBe(true);

      table.toggleAllPageRowsSelection();
      expect(table.isAllPageRowsSelected()).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('should report indeterminate state', () => {
    const { table, cleanup } = createTableInContext({ selection: true });

    try {
      table.toggleRowSelection('1');
      expect(table.isSomePageRowsSelected()).toBe(true);
      expect(table.isAllPageRowsSelected()).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('should respect isRowSelectable', () => {
    const { table, cleanup } = createTableInContext({
      selection: {
        isRowSelectable: (row) => (row as User).role === 'admin',
      },
    });

    try {
      const row = table.getRow('2');

      expect(row!.isSelectable()).toBe(false);

      const row1 = table.getRow('1');

      expect(row1!.isSelectable()).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('should clear selection', () => {
    const { table, cleanup } = createTableInContext({ selection: true });

    try {
      table.toggleRowSelection('1');
      table.toggleRowSelection('2');
      table.clearSelection();

      expect(table.getSelection()).toEqual({});
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Expansion', () => {
  it('should start with no expanded rows', () => {
    const { table, cleanup } = createTableInContext({ expansion: true });

    try {
      expect(table.getExpanded()).toEqual({});
      expect(table.isRowExpanded('1')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('should toggle row expansion', () => {
    const { table, cleanup } = createTableInContext({ expansion: true });

    try {
      table.toggleRowExpansion('1');
      expect(table.isRowExpanded('1')).toBe(true);

      table.toggleRowExpansion('1');
      expect(table.isRowExpanded('1')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('should clear all expanded rows', () => {
    const { table, cleanup } = createTableInContext({ expansion: true });

    try {
      table.toggleRowExpansion('1');
      table.toggleRowExpansion('3');
      table.clearExpanded();

      expect(table.getExpanded()).toEqual({});
    } finally {
      cleanup();
    }
  });

  it('should expose expansion state on row models', () => {
    const { table, cleanup } = createTableInContext({ expansion: true });

    try {
      table.toggleRowExpansion('2');
      const row = table.getRow('2');

      expect(row!.isExpanded()).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Pagination', () => {
  it('should default to page 1 with pageSize 20', () => {
    const { table, cleanup } = createTableInContext({
      pagination: true,
    });

    try {
      const pagination = table.getPagination();

      expect(pagination.page).toBe(1);
      expect(pagination.pageSize).toBe(20);
    } finally {
      cleanup();
    }
  });

  it('should paginate rows', () => {
    const { table, cleanup } = createTableInContext({
      pagination: { pageSize: 2 },
    });

    try {
      expect(table.getPageRows()).toHaveLength(2);
      expect(table.getPageCount()).toBe(3);
    } finally {
      cleanup();
    }
  });

  it('should navigate pages', () => {
    const { table, cleanup } = createTableInContext({
      pagination: { pageSize: 2 },
    });

    try {
      expect(table.canPreviousPage()).toBe(false);
      expect(table.canNextPage()).toBe(true);

      table.nextPage();
      expect(table.getPagination().page).toBe(2);
      expect(table.canPreviousPage()).toBe(true);

      table.previousPage();
      expect(table.getPagination().page).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should set page size and reset to page 1', () => {
    const { table, cleanup } = createTableInContext({
      pagination: { pageSize: 2 },
    });

    try {
      table.nextPage();
      table.setPageSize(5);

      expect(table.getPagination().pageSize).toBe(5);
      expect(table.getPagination().page).toBe(1);
      expect(table.getPageCount()).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should clamp page within bounds', () => {
    const { table, cleanup } = createTableInContext({
      pagination: { pageSize: 2 },
    });

    try {
      table.setPage(100);
      expect(table.getPagination().page).toBe(3);

      table.setPage(0);
      expect(table.getPagination().page).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should report total row count', () => {
    const { table, cleanup } = createTableInContext({
      pagination: { pageSize: 2 },
    });

    try {
      expect(table.getTotalRowCount()).toBe(5);
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Column Visibility', () => {
  it('should show all columns by default', () => {
    const { table, cleanup } = createTableInContext();

    try {
      expect(table.getVisibleColumns()).toHaveLength(4);
      expect(table.isColumnVisible('name')).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('should hide a column', () => {
    const { table, cleanup } = createTableInContext();

    try {
      table.setColumnVisible('age', false);

      expect(table.isColumnVisible('age')).toBe(false);
      expect(table.getVisibleColumns()).toHaveLength(3);
    } finally {
      cleanup();
    }
  });

  it('should toggle column visibility', () => {
    const { table, cleanup } = createTableInContext();

    try {
      table.toggleColumnVisibility('age');
      expect(table.isColumnVisible('age')).toBe(false);

      table.toggleColumnVisibility('age');
      expect(table.isColumnVisible('age')).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('should set visibility for multiple columns', () => {
    const { table, cleanup } = createTableInContext();

    try {
      table.setColumnVisibility({ age: false, role: false });

      expect(table.isColumnVisible('age')).toBe(false);
      expect(table.isColumnVisible('role')).toBe(false);
      expect(table.getVisibleColumns()).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it('should respect defaultVisible on column def', () => {
    const { table, cleanup } = createTableInContext({
      columns: [
        ...baseColumns,
        column<User>({
          id: 'hidden',
          header: 'Hidden',
          accessor: (row) => row.id,
          defaultVisible: false,
        }),
      ],
    });

    try {
      expect(table.isColumnVisible('hidden')).toBe(false);
      expect(table.getVisibleColumns()).toHaveLength(4);
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Data Pipeline', () => {
  it('should apply filter → sort → paginate in order', () => {
    const { table, cleanup } = createTableInContext({
      sorting: true,
      filtering: true,
      pagination: { pageSize: 2 },
    });

    try {
      // Mutate after mount, then read
      table.setGlobalFilter('alice');
      table.setSorting([{ id: 'name', desc: false }]);

      // "alice" should match only Alice (name or email contains "alice")
      const filtered = table.getFilteredRows();

      expect(filtered).toHaveLength(1);
      expect(filtered[0].original.name).toBe('Alice');
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Data State', () => {
  it('should return idle when data has rows', () => {
    const { table, cleanup } = createTableInContext();

    try {
      expect(table.getDataState()).toBe('idle');
    } finally {
      cleanup();
    }
  });

  it('should return loading', () => {
    const { table, cleanup } = createTableInContext({ loading: true });

    try {
      expect(table.getDataState()).toBe('loading');
    } finally {
      cleanup();
    }
  });

  it('should return error (overrides loading)', () => {
    const { table, cleanup } = createTableInContext({
      loading: true,
      error: true,
    });

    try {
      expect(table.getDataState()).toBe('error');
    } finally {
      cleanup();
    }
  });

  it('should return empty when no data', () => {
    const { table, cleanup } = createTableInContext({ data: () => [] });

    try {
      expect(table.getDataState()).toBe('empty');
    } finally {
      cleanup();
    }
  });

  it('should return filtered-empty when all rows filtered out', () => {
    const { table, cleanup } = createTableInContext({
      filtering: true,
    });

    try {
      table.setGlobalFilter('zzz_no_match');
      expect(table.getDataState()).toBe('filtered-empty');
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Server Mode', () => {
  it('should not sort when manualSorting is true', () => {
    const { table, cleanup } = createTableInContext({
      sorting: true,
      manualSorting: true,
    });

    try {
      table.setSorting([{ id: 'name', desc: true }]);
      const rows = table.getPageRows();

      expect(rows[0].original.name).toBe('Alice');
    } finally {
      cleanup();
    }
  });

  it('should not filter when manualFiltering is true', () => {
    const { table, cleanup } = createTableInContext({
      filtering: true,
      manualFiltering: true,
    });

    try {
      table.setGlobalFilter('alice');
      const rows = table.getPageRows();

      expect(rows).toHaveLength(5);
    } finally {
      cleanup();
    }
  });

  it('should not paginate when manualPagination is true', () => {
    const { table, cleanup } = createTableInContext({
      pagination: { pageSize: 2 },
      manualPagination: true,
    });

    try {
      const rows = table.getPageRows();

      expect(rows).toHaveLength(5);
    } finally {
      cleanup();
    }
  });

  it('should use totalRowCount for page count in server mode', () => {
    const { table, cleanup } = createTableInContext({
      pagination: { pageSize: 10 },
      manualPagination: true,
      totalRowCount: 100,
    });

    try {
      expect(table.getPageCount()).toBe(10);
      expect(table.getTotalRowCount()).toBe(100);
    } finally {
      cleanup();
    }
  });

  it('should expose manual mode flags', () => {
    const { table, cleanup } = createTableInContext({
      manualSorting: true,
      manualFiltering: true,
      manualPagination: true,
    });

    try {
      expect(table.isManualSorting()).toBe(true);
      expect(table.isManualFiltering()).toBe(true);
      expect(table.isManualPagination()).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Mobile Summary', () => {
  it('should use mobileRow config for list primary', () => {
    const { table, cleanup } = createTableInContext({
      mobileRow: {
        primary: (row) => row.name,
        secondary: [(row) => row.email],
        meta: [(row) => row.role],
      },
    });

    try {
      const row = table.getPageRows()[0];

      expect(row.getListPrimary()).toBe('Alice');
    } finally {
      cleanup();
    }
  });

  it('should use mobileRow config for secondary and meta', () => {
    const { table, cleanup } = createTableInContext({
      mobileRow: {
        primary: (row) => row.name,
        secondary: [(row) => row.email],
        meta: [(row) => row.role],
      },
    });

    try {
      const row = table.getPageRows()[0];

      expect(row.getListSecondary()).toEqual(['alice@example.com']);
      expect(row.getListMeta()).toEqual(['admin']);
    } finally {
      cleanup();
    }
  });

  it('should fall back to column priority when no mobileRow', () => {
    const { table, cleanup } = createTableInContext();

    try {
      const row = table.getPageRows()[0];

      expect(row.getListPrimary()).toBe('Alice');
      expect(row.getListSecondary()).toEqual(['alice@example.com', 'admin']);
    } finally {
      cleanup();
    }
  });
});

describe('createDataTable - Responsive', () => {
  it('should default to table mode', () => {
    const { table, cleanup } = createTableInContext();

    try {
      expect(table.getResponsiveMode()).toBe('table');
    } finally {
      cleanup();
    }
  });

  it('should respect mode: list', () => {
    const { table, cleanup } = createTableInContext({
      responsive: { mode: 'list' },
    });

    try {
      expect(table.getResponsiveMode()).toBe('list');
    } finally {
      cleanup();
    }
  });

  it('should respect mode: table', () => {
    const { table, cleanup } = createTableInContext({
      responsive: { mode: 'table' },
    });

    try {
      expect(table.getResponsiveMode()).toBe('table');
    } finally {
      cleanup();
    }
  });
});

describe('column helper', () => {
  it('should return the definition unchanged', () => {
    const def = column<User>({
      id: 'test',
      header: 'Test',
      accessor: (row) => row.name,
      sortable: true,
    });

    expect(def.id).toBe('test');
    expect(def.sortable).toBe(true);
  });
});
