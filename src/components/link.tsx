/**
 * Link component for client-side navigation
 */

import { navigate } from '../router/navigate';
import { applyInteractionPolicy } from '../foundations/interactions/interaction-policy';
import { mergeProps } from '../foundations/utilities/merge-props';

export type LinkProps = Omit<
  JSX.IntrinsicElements['a'],
  | 'children'
  | 'href'
  | 'class'
  | 'rel'
  | 'target'
  | 'aria-current'
  | 'aria-label'
> & {
  href: string;
  class?: string;
  children?: unknown;
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
  href,
  class: className,
  children,
  rel,
  target,
  'aria-current': ariaCurrent,
  'aria-label': ariaLabel,
  ...rest
}: LinkProps): JSX.Element {
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

      // Don't intercept external links or explicit target
      if (target) {
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

  return <a {...props}>{children}</a>;
}
