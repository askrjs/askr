import { Slot, mergeProps } from '@askrjs/askr/foundations';
import type {
  BreadcrumbAsChildProps,
  BreadcrumbCurrentAsChildProps,
  BreadcrumbCurrentProps,
  BreadcrumbItemAsChildProps,
  BreadcrumbItemProps,
  BreadcrumbLinkAsChildProps,
  BreadcrumbLinkProps,
  BreadcrumbListAsChildProps,
  BreadcrumbListProps,
  BreadcrumbProps,
  BreadcrumbSeparatorAsChildProps,
  BreadcrumbSeparatorProps,
} from './breadcrumb.types';

export function Breadcrumb(props: BreadcrumbProps): JSX.Element;
export function Breadcrumb(props: BreadcrumbAsChildProps): JSX.Element;
export function Breadcrumb(props: BreadcrumbProps | BreadcrumbAsChildProps) {
  const { asChild, children, ref, 'aria-label': ariaLabel, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'aria-label': ariaLabel ?? 'Breadcrumb',
    'data-slot': 'breadcrumb',
    'data-breadcrumb': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <nav {...finalProps}>{children}</nav>;
}

export function BreadcrumbList(props: BreadcrumbListProps): JSX.Element;
export function BreadcrumbList(props: BreadcrumbListAsChildProps): JSX.Element;
export function BreadcrumbList(
  props: BreadcrumbListProps | BreadcrumbListAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'breadcrumb-list',
    'data-breadcrumb-list': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <ol {...finalProps}>{children}</ol>;
}

export function BreadcrumbItem(props: BreadcrumbItemProps): JSX.Element;
export function BreadcrumbItem(props: BreadcrumbItemAsChildProps): JSX.Element;
export function BreadcrumbItem(
  props: BreadcrumbItemProps | BreadcrumbItemAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'breadcrumb-item',
    'data-breadcrumb-item': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <li {...finalProps}>{children}</li>;
}

export function BreadcrumbLink(props: BreadcrumbLinkProps): JSX.Element;
export function BreadcrumbLink(props: BreadcrumbLinkAsChildProps): JSX.Element;
export function BreadcrumbLink(
  props: BreadcrumbLinkProps | BreadcrumbLinkAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'breadcrumb-link',
    'data-breadcrumb-link': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <a {...finalProps}>{children}</a>;
}

export function BreadcrumbCurrent(props: BreadcrumbCurrentProps): JSX.Element;
export function BreadcrumbCurrent(
  props: BreadcrumbCurrentAsChildProps
): JSX.Element;
export function BreadcrumbCurrent(
  props: BreadcrumbCurrentProps | BreadcrumbCurrentAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'aria-current': 'page',
    'data-slot': 'breadcrumb-current',
    'data-breadcrumb-current': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <span {...finalProps}>{children}</span>;
}

export function BreadcrumbSeparator(
  props: BreadcrumbSeparatorProps
): JSX.Element;
export function BreadcrumbSeparator(
  props: BreadcrumbSeparatorAsChildProps
): JSX.Element;
export function BreadcrumbSeparator(
  props: BreadcrumbSeparatorProps | BreadcrumbSeparatorAsChildProps
) {
  const { asChild, children, ref, ...rest } = props;
  const finalProps = mergeProps(rest, {
    ref,
    'aria-hidden': 'true',
    'data-slot': 'breadcrumb-separator',
    'data-breadcrumb-separator': 'true',
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children ?? '/'} />;
  }

  return <span {...finalProps}>{children ?? '/'}</span>;
}
