import type { BoxAsChildProps, BoxProps } from '../_internal/types';

export type BreadcrumbOwnProps = {
  children?: unknown;
  'aria-label'?: string;
};

export type BreadcrumbProps = BoxProps<'nav', HTMLElement> & BreadcrumbOwnProps;
export type BreadcrumbAsChildProps = BoxAsChildProps & BreadcrumbOwnProps;

export type BreadcrumbListProps = BoxProps<'ol', HTMLOListElement>;
export type BreadcrumbListAsChildProps = BoxAsChildProps;

export type BreadcrumbItemProps = BoxProps<'li', HTMLLIElement>;
export type BreadcrumbItemAsChildProps = BoxAsChildProps;

export type BreadcrumbLinkProps = BoxProps<'a', HTMLAnchorElement>;
export type BreadcrumbLinkAsChildProps = BoxAsChildProps;

export type BreadcrumbCurrentProps = BoxProps<'span', HTMLSpanElement>;
export type BreadcrumbCurrentAsChildProps = BoxAsChildProps;

export type BreadcrumbSeparatorProps = BoxProps<'span', HTMLSpanElement>;
export type BreadcrumbSeparatorAsChildProps = BoxAsChildProps;
