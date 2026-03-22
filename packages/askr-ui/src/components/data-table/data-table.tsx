import { mergeProps } from '@askrjs/askr/foundations';
import { mapJsxTree } from '../_internal/jsx';
import { DATA_TABLE_A11Y_CONTRACT } from './data-table.a11y';
import type {
  DataTableContentProps,
  DataTableRootProps,
  InjectedDataTableProps,
} from './data-table.types';
import { DataTableTableView } from './data-table-table-view';
import { DataTableListView } from './data-table-list-view';
import { DataTableToolbar, DataTableSearch } from './data-table-toolbar';
import { DataTablePagination } from './data-table-pagination';
import {
  DataTableEmpty,
  DataTableLoading,
  DataTableError,
} from './data-table-states';

const SLOTS = DATA_TABLE_A11Y_CONTRACT.SLOTS;

// All DataTable sub-component types that should receive injection
const DATA_TABLE_COMPONENTS = new Set<unknown>([
  DataTableContent,
  DataTableTableView,
  DataTableListView,
  DataTableToolbar,
  DataTableSearch,
  DataTablePagination,
  DataTableEmpty,
  DataTableLoading,
  DataTableError,
]);

function isDataTableComponent(type: unknown): boolean {
  return DATA_TABLE_COMPONENTS.has(type);
}

export function readInjectedTableProps<T>(
  props: InjectedDataTableProps<T>
): Required<InjectedDataTableProps<T>> {
  if (!props.__table || !props.__tableId) {
    throw new Error(
      'DataTable sub-components must be used within <DataTableRoot>'
    );
  }

  return {
    __table: props.__table,
    __tableId: props.__tableId,
  };
}

export function DataTableRoot<T>(props: DataTableRootProps<T>) {
  const { table, children, id, ref, ...rest } = props;
  const tableId = id ?? table.tableId;

  const enhancedChildren = mapJsxTree(children, (element) => {
    if (isDataTableComponent(element.type)) {
      return {
        ...element,
        props: {
          ...element.props,
          __table: table,
          __tableId: tableId,
        },
      };
    }

    return element;
  });

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.root,
    'data-state': table.getDataState(),
    'data-responsive-mode': table.getResponsiveMode(),
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

export function DataTableContent<T>(
  props: DataTableContentProps & InjectedDataTableProps<T>
) {
  const { children, ref, __table, __tableId, ...rest } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.content,
  });

  // If no children provided, auto-render based on state
  if (children === undefined || children === null) {
    return (
      <div {...finalProps}>
        <DataTableAutoContent __table={__table} __tableId={__tableId} />
      </div>
    );
  }

  // Inject into children
  const enhancedChildren = mapJsxTree(children, (element) => {
    if (isDataTableComponent(element.type)) {
      return {
        ...element,
        props: {
          ...element.props,
          __table: __table,
          __tableId: __tableId,
        },
      };
    }

    return element;
  });

  return <div {...finalProps}>{enhancedChildren}</div>;
}

function DataTableAutoContent<T>(props: InjectedDataTableProps<T>) {
  const { __table, __tableId } = props;

  if (!__table) {
    return null;
  }

  const dataState = __table.getDataState();

  if (dataState === 'loading') {
    return <DataTableLoading __table={__table} __tableId={__tableId} />;
  }

  if (dataState === 'error') {
    return <DataTableError __table={__table} __tableId={__tableId} />;
  }

  if (dataState === 'empty' || dataState === 'filtered-empty') {
    return <DataTableEmpty __table={__table} __tableId={__tableId} />;
  }

  const mode = __table.getResponsiveMode();

  if (mode === 'list') {
    return <DataTableListView __table={__table} __tableId={__tableId} />;
  }

  if (mode === 'table') {
    return <DataTableTableView __table={__table} __tableId={__tableId} />;
  }

  // auto: render both with data-responsive-view for CSS switching
  return (
    <>
      <DataTableTableView __table={__table} __tableId={__tableId} />
      <DataTableListView __table={__table} __tableId={__tableId} />
    </>
  );
}
