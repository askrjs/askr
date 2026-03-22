import {
  Slot,
  controllableState,
  mergeProps,
  pressable,
} from '@askrjs/askr/foundations';
import { resolveCompoundId, resolvePartId } from '../_internal/id';
import { mapJsxTree } from '../_internal/jsx';
import { buildPaginationModel, clampPage } from '../_internal/pagination';
import type {
  PaginationEllipsisAsChildProps,
  PaginationEllipsisProps,
  PaginationNextAsChildProps,
  PaginationNextProps,
  PaginationPageAsChildProps,
  PaginationPageProps,
  PaginationPreviousAsChildProps,
  PaginationPreviousProps,
  PaginationProps,
} from './pagination.types';

type InjectedPaginationProps = {
  __paginationId?: string;
  __page?: number;
  __setPage?: (page: number) => void;
  __count?: number;
  __disabled?: boolean;
};

function readInjectedPaginationProps(
  props: InjectedPaginationProps
): Required<InjectedPaginationProps> {
  if (
    !props.__paginationId ||
    props.__page === undefined ||
    !props.__setPage ||
    props.__count === undefined ||
    props.__disabled === undefined
  ) {
    throw new Error('Pagination components must be used within <Pagination>');
  }

  return {
    __paginationId: props.__paginationId,
    __page: props.__page,
    __setPage: props.__setPage,
    __count: props.__count,
    __disabled: props.__disabled,
  };
}

export function Pagination(props: PaginationProps) {
  const {
    boundaryCount = 1,
    children,
    count,
    defaultPage = 1,
    disabled = false,
    id,
    onPageChange,
    page,
    ref,
    siblingCount = 1,
    ...rest
  } = props;
  const paginationId = resolveCompoundId('pagination', id, children ?? count);
  const pageState = controllableState({
    value: page,
    defaultValue: clampPage(defaultPage, count),
    onChange: onPageChange,
  });
  const currentPage = clampPage(pageState(), count);
  const model = buildPaginationModel(
    count,
    currentPage,
    siblingCount,
    boundaryCount
  );
  const defaultChildren = [
    <PaginationPrevious key="previous">Previous</PaginationPrevious>,
    ...model.map((entry, index) =>
      entry.type === 'page' ? (
        <PaginationPage key={`page-${entry.page}`} page={entry.page} />
      ) : (
        <PaginationEllipsis key={`ellipsis-${entry.key}-${index}`} />
      )
    ),
    <PaginationNext key="next">Next</PaginationNext>,
  ];
  const pageEntries = model.filter((entry) => entry.type === 'page');
  let pageCursor = 0;
  const setPage = (nextPage: number) => {
    pageState.set(clampPage(nextPage, count));
  };
  const enhancedChildren = mapJsxTree(
    children ?? defaultChildren,
    (element) => {
      if (
        element.type !== PaginationPrevious &&
        element.type !== PaginationNext &&
        element.type !== PaginationPage &&
        element.type !== PaginationEllipsis
      ) {
        return element;
      }

      if (element.type === PaginationPage) {
        const resolvedPage =
          typeof element.props?.page === 'number'
            ? element.props.page
            : (pageEntries[pageCursor++]?.page ?? currentPage);

        return {
          ...element,
          props: {
            ...element.props,
            page: resolvedPage,
            __paginationId: paginationId,
            __page: currentPage,
            __setPage: setPage,
            __count: count,
            __disabled: disabled,
          },
        };
      }

      if (element.type === PaginationEllipsis) {
        return element;
      }

      return {
        ...element,
        props: {
          ...element.props,
          __paginationId: paginationId,
          __page: currentPage,
          __setPage: setPage,
          __count: count,
          __disabled: disabled,
        },
      };
    }
  );
  const finalProps = mergeProps(rest, {
    ref,
    'aria-label': 'Pagination',
    'data-slot': 'pagination',
    'data-pagination': 'true',
  });

  return <nav {...finalProps}>{enhancedChildren}</nav>;
}

export function PaginationPrevious(props: PaginationPreviousProps): JSX.Element;
export function PaginationPrevious(
  props: PaginationPreviousAsChildProps
): JSX.Element;
export function PaginationPrevious(
  props:
    | (PaginationPreviousProps & InjectedPaginationProps)
    | (PaginationPreviousAsChildProps & InjectedPaginationProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __paginationId,
    __page,
    __setPage,
    __count,
    __disabled,
    ...rest
  } = props;
  const injected = readInjectedPaginationProps({
    __paginationId,
    __page,
    __setPage,
    __count,
    __disabled,
  });
  const isDisabled = disabled || injected.__disabled || injected.__page <= 1;
  const interactionProps = pressable({
    disabled: isDisabled,
    onPress: (event) => {
      onPress?.(event);

      if (!event.defaultPrevented) {
        injected.__setPage(injected.__page - 1);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(rest, {
    ...interactionProps,
    ref,
    id: resolvePartId(injected.__paginationId, 'previous'),
    'aria-label': 'Previous page',
    'data-slot': 'pagination-previous',
    'data-disabled': isDisabled ? 'true' : undefined,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return (
    <button type={typeProp ?? 'button'} {...finalProps}>
      {children ?? 'Previous'}
    </button>
  );
}

export function PaginationNext(props: PaginationNextProps): JSX.Element;
export function PaginationNext(props: PaginationNextAsChildProps): JSX.Element;
export function PaginationNext(
  props:
    | (PaginationNextProps & InjectedPaginationProps)
    | (PaginationNextAsChildProps & InjectedPaginationProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    ref,
    type: typeProp,
    __paginationId,
    __page,
    __setPage,
    __count,
    __disabled,
    ...rest
  } = props;
  const injected = readInjectedPaginationProps({
    __paginationId,
    __page,
    __setPage,
    __count,
    __disabled,
  });
  const isDisabled =
    disabled || injected.__disabled || injected.__page >= injected.__count;
  const interactionProps = pressable({
    disabled: isDisabled,
    onPress: (event) => {
      onPress?.(event);

      if (!event.defaultPrevented) {
        injected.__setPage(injected.__page + 1);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(rest, {
    ...interactionProps,
    ref,
    id: resolvePartId(injected.__paginationId, 'next'),
    'aria-label': 'Next page',
    'data-slot': 'pagination-next',
    'data-disabled': isDisabled ? 'true' : undefined,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return (
    <button type={typeProp ?? 'button'} {...finalProps}>
      {children ?? 'Next'}
    </button>
  );
}

type PaginationPageInjectedProps = InjectedPaginationProps & {
  page?: number;
};

function readInjectedPaginationPageProps(
  props: PaginationPageInjectedProps
): Required<PaginationPageInjectedProps> {
  const injected = readInjectedPaginationProps(props);

  if (props.page === undefined) {
    throw new Error('PaginationPage requires a page number');
  }

  return {
    ...injected,
    page: props.page,
  };
}

export function PaginationPage(props: PaginationPageProps): JSX.Element;
export function PaginationPage(props: PaginationPageAsChildProps): JSX.Element;
export function PaginationPage(
  props:
    | (PaginationPageProps & PaginationPageInjectedProps)
    | (PaginationPageAsChildProps & PaginationPageInjectedProps)
) {
  const {
    asChild,
    children,
    disabled = false,
    onPress,
    page,
    ref,
    type: typeProp,
    __paginationId,
    __page,
    __setPage,
    __count,
    __disabled,
    ...rest
  } = props;
  const injected = readInjectedPaginationPageProps({
    page,
    __paginationId,
    __page,
    __setPage,
    __count,
    __disabled,
  });
  const isDisabled = disabled || injected.__disabled;
  const selected = injected.__page === injected.page;
  const interactionProps = pressable({
    disabled: isDisabled,
    onPress: (event) => {
      onPress?.(event);

      if (!event.defaultPrevented) {
        injected.__setPage(injected.page);
      }
    },
    isNativeButton: !asChild,
  });
  const finalProps = mergeProps(rest, {
    ...interactionProps,
    ref,
    id: resolvePartId(injected.__paginationId, `page-${injected.page}`),
    'aria-label': `Page ${injected.page}`,
    'aria-current': selected ? 'page' : undefined,
    'data-slot': 'pagination-page',
    'data-state': selected ? 'active' : 'inactive',
    'data-page': String(injected.page),
    'data-disabled': isDisabled ? 'true' : undefined,
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return (
    <button type={typeProp ?? 'button'} {...finalProps}>
      {children ?? String(injected.page)}
    </button>
  );
}

export function PaginationEllipsis(props: PaginationEllipsisProps): JSX.Element;
export function PaginationEllipsis(
  props: PaginationEllipsisAsChildProps
): JSX.Element;
export function PaginationEllipsis(
  props: PaginationEllipsisProps | PaginationEllipsisAsChildProps
) {
  const {
    asChild,
    children,
    ref,
    __paginationId: _paginationId,
    __page: _page,
    __setPage: _setPage,
    __count: _count,
    __disabled: _disabled,
    ...rest
  } = props as (PaginationEllipsisProps | PaginationEllipsisAsChildProps) &
    Partial<InjectedPaginationProps>;
  const finalProps = mergeProps(rest, {
    ref,
    'aria-hidden': 'true',
    'data-slot': 'pagination-ellipsis',
    'data-pagination-ellipsis': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children ?? '...'} />;
  }

  return <span {...finalProps}>{children ?? '...'}</span>;
}
