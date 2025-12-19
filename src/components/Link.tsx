/**
 * Link component for client-side navigation
 */

import { navigate } from '../router/navigate';
import type { JSXElement } from '../jsx/types';

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
 */
export function Link({ href, children }: LinkProps): JSXElement {
  return {
    type: 'a',
    props: {
      href,
      children,
      onClick: (e: Event) => {
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
    },
  };
}
