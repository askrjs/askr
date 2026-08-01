/**
 * Link component for client-side navigation
 */

import '../jsx/types';
import type { JSXElement } from '../common/jsx';
import type { AnchorIntrinsicProps, Props } from '../common/props';
import type { RenderableChild } from '../common/vnode';
import { navigate } from '../router/navigate';
import type { RouteDestination } from '../common/router';
import { applyInteractionPolicy } from '../foundations/interactions';
import { mergeProps } from '../foundations/utilities';
import { isSafeHref } from '../common/url';
import { addRouteBasePath } from '../router/base-path';
import { getActiveRouteBasePath } from '../router/store';

type LinkBaseProps = Omit<
  Props,
  | 'children'
  | 'href'
  | 'class'
  | 'rel'
  | 'target'
  | 'aria-current'
  | 'aria-label'
> & {
  class?: string;
  children?: RenderableChild;
  /**
   * Optional rel attribute for link relationships.
   * Common values: "noopener", "noreferrer", "nofollow"
   */
  rel?: string;
  /**
   * Optional target attribute.
   * Use "_blank" for new tab/window.
   */
  target?: string;
  /**
   * Optional aria-current attribute for indicating current page/location.
   * Use "page" for the current page in navigation.
   */
  'aria-current'?:
    | 'page'
    | 'step'
    | 'location'
    | 'date'
    | 'time'
    | 'true'
    | 'false';
  /**
   * Optional aria-label for accessibility when link text isn't descriptive enough.
   */
  'aria-label'?: string;
  onPress?: (event: Event) => void;
  onClick?: (event: MouseEvent) => void;
};

export type LinkProps = LinkBaseProps &
  ({ href: string; to?: never } | { href?: never; to: RouteDestination });

function isSameOriginNavigableHref(href: string): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const target = new URL(href, window.location.href);
    return (
      target.origin === window.location.origin &&
      (target.protocol === 'http:' || target.protocol === 'https:')
    );
  } catch {
    return false;
  }
}

/**
 * Link component that prevents default navigation and uses navigate()
 * Provides declarative way to navigate between routes
 *
 * Accessibility features:
 * - Proper semantic <a> element (not a button)
 * - Supports aria-current for indicating active page
 * - Supports aria-label for descriptive labels
 * - Keyboard accessible (Enter key handled by native <a> element)
 *
 * Respects native browser behaviors:
 * - Middle-click (opens in new tab)
 * - Ctrl/Cmd+click (opens in new tab)
 * - Shift+click (opens in new window)
 * - Alt+click (downloads link)
 * - Right-click context menu
 *
 * Best practices:
 * - Use target="_blank" with rel="noopener noreferrer" for external links
 * - Use aria-current="page" for the current page in navigation
 * - Provide descriptive link text or aria-label
 * - For a styled link with automatic active-route state, install
 *   `@askrjs/themes` and use `NavLink` from `@askrjs/themes/components`
 *
 * Uses applyInteractionPolicy to enforce pit-of-success principles:
 * - Interaction behavior centralized in foundations
 * - Keyboard handling automatic
 * - Composable via mergeProps
 */
export function Link({
  href: suppliedHref,
  to,
  class: className,
  children,
  rel,
  target,
  'aria-current': ariaCurrent,
  'aria-label': ariaLabel,
  onPress,
  onClick,
  ...rest
}: LinkProps): JSXElement {
  const supplied = to?.href ?? suppliedHref;
  const href = supplied
    ? addRouteBasePath(supplied, getActiveRouteBasePath())
    : supplied;
  if (!href) throw new Error('Link requires href or to.');
  if (!isSafeHref(href)) {
    throw new TypeError('Link href uses an unsafe URL scheme.');
  }
  const handleNavigation = (e: Event) => {
    if (e.defaultPrevented) {
      return;
    }

    const event = e as MouseEvent;

    // Only intercept left-click without modifiers. Default button to 0 for
    // keyboard-generated click events and test doubles.
    const button = event.button ?? 0;
    if (
      button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (target || !isSameOriginNavigableHref(href)) {
      return;
    }

    if ((rest as Record<string, unknown>).download !== undefined) {
      return;
    }

    event.preventDefault();
    navigate(href);
  };

  const interaction = applyInteractionPolicy({
    isNative: true,
    disabled: false,
    onPress: handleNavigation,
    ref: (rest as Record<string, unknown>).ref as never,
  });
  const consumerActivation = (e: Event) => {
    onPress?.(e);
    onClick?.(e as MouseEvent);
  };

  const props = mergeProps(interaction, {
    ...rest,
    onClick: consumerActivation,
    href,
    class: className,
    rel,
    target,
    'aria-current': ariaCurrent,
    'aria-label': ariaLabel,
  });

  return <a {...(props as AnchorIntrinsicProps)}>{children}</a>;
}
