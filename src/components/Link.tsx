/**
 * Link component for client-side navigation
 */

import { navigate } from '../router/navigate';
import { applyInteractionPolicy } from '../foundations/interactions/interaction-policy';
import { mergeProps } from '../foundations/utilities/merge-props';

export interface LinkProps {
  href: string;
  children?: unknown;
}

/**
 * Link component that prevents default navigation and uses navigate()
 * Provides declarative way to navigate between routes
 *
 * Respects:
 * - Middle-click (opens in new tab)
 * - Ctrl/Cmd+click (opens in new tab)
 * - Shift+click (opens in new window)
 * - Right-click context menu
 *
 * Uses applyInteractionPolicy to enforce pit-of-success principles:
 * - Interaction behavior centralized in foundations
 * - Keyboard handling (Enter/Space) automatic
 * - Composable via mergeProps
 */
export function Link({ href, children }: LinkProps): unknown {
  const interaction = applyInteractionPolicy({
    isNative: true,
    disabled: false,
    onPress: (e: Event) => {
      const event = e as MouseEvent;

      // Only handle left-click without modifiers
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

      event.preventDefault();
      navigate(href);
    },
  });

  return {
    type: 'a',
    props: mergeProps(interaction, {
      href,
      children,
    }),
  };
}
