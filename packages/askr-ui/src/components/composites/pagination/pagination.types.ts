import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
} from '../../_internal/types';

export type PaginationOwnProps = {
  children?: unknown;
  id?: string;
  count: number;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  siblingCount?: number;
  boundaryCount?: number;
  disabled?: boolean;
};

export type PaginationProps = BoxProps<'nav', HTMLElement> & PaginationOwnProps;

export type PaginationPreviousProps = ButtonLikeProps<
  'button',
  HTMLButtonElement
>;
export type PaginationPreviousAsChildProps = ButtonLikeAsChildProps;

export type PaginationNextProps = ButtonLikeProps<'button', HTMLButtonElement>;
export type PaginationNextAsChildProps = ButtonLikeAsChildProps;

export type PaginationPageOwnProps = {
  page?: number;
  children?: unknown;
};

export type PaginationPageProps = ButtonLikeProps<'button', HTMLButtonElement> &
  PaginationPageOwnProps;
export type PaginationPageAsChildProps = ButtonLikeAsChildProps &
  PaginationPageOwnProps;

export type PaginationEllipsisProps = BoxProps<'span', HTMLSpanElement>;
export type PaginationEllipsisAsChildProps = BoxAsChildProps;
