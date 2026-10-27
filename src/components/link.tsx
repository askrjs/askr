/**
 * Link component for client-side navigation
 */

import '../jsx/types';
import type { JSXElement } from '../common/jsx';
import type { KnownIntrinsicElementProps, Props } from '../common/props';
import type { RenderableChild } from '../common/vnode';
import { navigateToPublicHref } from '../router/navigate';
import type { RouteDestination } from '../common/router';
import { applyInteractionPolicy } from '../foundations/interactions';
import {
  composeHandlers,
  composeRefs,
  mergeProps,
} from '../foundations/utilities';
import { prefetchRoute } from '../router/route-prefetch';
import { assertPathHrefStaysOnOrigin, isSafeHref } from '../common/url';
import { addLogicalRouteBasePath } from '../router/base-path';
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
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Entry-local history state for the destination, as `navigate(href, { state })`. */
  state?: unknown;
  /** Scroll to the top (default) or keep the offset after the navigation. */
  scroll?: 'top' | 'preserve';
  /**
   * Warm the destination before the visitor commits to it. `'intent'` does so
   * on pointer enter and keyboard focus, `'render'` when the link mounts, and
   * `'none'` (the default) never. Prefetching starts the route's lazy chunk and
   * resolves it like a navigation (auth, policies, loaders through the loader
   * cache) without rendering it.
   */
  prefetch?: 'intent' | 'render' | 'none';
  /**
   * Animate the page change with `document.startViewTransition()` when the
   * browser has it, as `navigate(href, { viewTransition: true })`.
   */
  viewTransition?: boolean;
};

/** Props for {@link Link}: either a raw `href` or a typed route `to` destination. */
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
  replace,
  state,
  scroll,
  prefetch = 'none',
  viewTransition,
  ...rest
}: LinkProps): JSXElement {
  // A typed destination already carries its public href; a raw href is logical.
  const href =
    to?.href ??
    (suppliedHref
      ? addLogicalRouteBasePath(suppliedHref, getActiveRouteBasePath())
      : suppliedHref);
  if (!href) throw new Error('Link requires href or to.');
  if (!isSafeHref(href)) {
    throw new TypeError('Link href uses an unsafe URL scheme.');
  }
  assertPathHrefStaysOnOrigin(href);
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

    if (
      (target && target.toLowerCase() !== '_self') ||
      !isSameOriginNavigableHref(href)
    ) {
      return;
    }

    if ((rest as Record<string, unknown>).download !== undefined) {
      return;
    }

    event.preventDefault();
    navigateToPublicHref(href, {
      ...(replace ? { replace: true } : {}),
      ...(scroll ? { scroll } : {}),
      ...(state !== undefined ? { state } : {}),
      ...(viewTransition !== undefined ? { viewTransition } : {}),
    });
  };

  const warm = () => prefetchRoute(href);
  const userProps = rest as Record<string, unknown>;
  const intentHandlers =
    prefetch === 'intent'
      ? {
          onPointerEnter: composeHandlers(
            warm,
            userProps.onPointerEnter as never
          ),
          onFocus: composeHandlers(warm, userProps.onFocus as never),
        }
      : {};
  const interaction = applyInteractionPolicy({
    isNative: true,
    disabled: false,
    onPress: handleNavigation,
    ref:
      prefetch === 'render'
        ? composeRefs(
            userProps.ref as never,
            ((element: Element | null) => {
              if (element) queueMicrotask(warm);
            }) as never
          )
        : (userProps.ref as never),
  });
  const consumerActivation = (e: Event) => {
    onPress?.(e);
    onClick?.(e as MouseEvent);
  };

  const props = mergeProps(interaction, {
    ...rest,
    ...intentHandlers,
    onClick: consumerActivation,
    href,
    class: className,
    rel,
    target,
    'aria-current': ariaCurrent,
    'aria-label': ariaLabel,
  });

  return <a {...(props as KnownIntrinsicElementProps['a'])}>{children}</a>;
}
