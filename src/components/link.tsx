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
  ...rest
}: LinkProps): JSXElement {
  const href = to?.href ?? suppliedHref;
  if (!href) throw new Error('Link requires href or to.');
  const interaction = applyInteractionPolicy({
    isNative: true,
    disabled: false,
    onPress: (e: Event) => {
      const event = e as MouseEvent;

      // Only intercept left-click without modifiers
      // Default button to 0 if undefined (for mock events in tests)
      const button = event.button ?? 0;
      if (
        button !== 0 || // not left-click
        event.ctrlKey || // Ctrl/Cmd+click
        event.metaKey || // Cmd on Mac
        event.shiftKey || // Shift+click
        event.altKey // Alt+click
      ) {
        return; // Let browser handle it (new tab, etc.)
      }

      // Don't intercept external links or explicit target.
      if (target || !isSameOriginNavigableHref(href)) {
        return; // Let browser handle it
      }

      event.preventDefault();
      navigate(href);
    },
  });

  const props = mergeProps(rest, {
    ...interaction,
    href,
    class: className,
    rel,
    target,
    'aria-current': ariaCurrent,
    'aria-label': ariaLabel,
  });

  return <a {...(props as AnchorIntrinsicProps)}>{children}</a>;
}
