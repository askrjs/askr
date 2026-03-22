import { mergeProps } from '@askrjs/askr/foundations';
import { DATA_TABLE_A11Y_CONTRACT } from './data-table.a11y';
import type {
  DataTableSearchProps,
  DataTableToolbarProps,
  InjectedDataTableProps,
} from './data-table.types';

const SLOTS = DATA_TABLE_A11Y_CONTRACT.SLOTS;

export function DataTableToolbar<T>(
  props: DataTableToolbarProps & InjectedDataTableProps<T>
) {
  const { children, ref, __table, __tableId, ...rest } = props;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': SLOTS.toolbar,
  });

  return <div {...finalProps}>{children}</div>;
}

export function DataTableSearch<T>(
  props: DataTableSearchProps & InjectedDataTableProps<T>
) {
  const {
    placeholder,
    debounceMs = 300,
    ref,
    __table,
    __tableId,
    ...rest
  } = props;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const value = target.value;

    if (debounceMs > 0) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        __table?.setGlobalFilter(value);
      }, debounceMs);
    } else {
      __table?.setGlobalFilter(value);
    }
  };

  const finalProps = mergeProps(rest, {
    ref,
    type: 'search',
    placeholder: placeholder ?? 'Search...',
    'data-slot': SLOTS.search,
    'aria-label': placeholder ?? 'Search',
    onInput: handleInput,
  });

  return <input {...finalProps} />;
}
