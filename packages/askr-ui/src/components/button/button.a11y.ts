/**
 * Accessibility contract for Button component
 *
 * Following WAI-ARIA Button Pattern:
 * https://www.w3.org/WAI/ARIA/apg/patterns/button/
 *
 * ## Role
 * - Native <button>: implicit role="button"
 * - asChild: preserves child role (e.g., role="button" on <div>)
 *
 * ## States
 * - disabled (native): uses `disabled` attribute
 * - disabled (asChild): uses `aria-disabled="true"` + `tabindex="-1"`
 *
 * ## Keyboard
 * - Space: Activates button (handled by pressable foundation)
 * - Enter: Activates button (handled by pressable foundation)
 * - Disabled buttons do not respond to interaction
 *
 * ## Focus
 * - Native buttons: focusable by default
 * - asChild elements: receive tabindex if not naturally focusable
 * - Disabled: removed from tab order (tabindex="-1" or native disabled)
 *
 * ## Screen Reader
 * - Announces role as "button"
 * - Announces disabled state
 * - Announces accessible name from text content or aria-label
 *
 * ## Implementation Notes
 * - All interaction behavior is delegated to `pressable` foundation
 * - Button component does NOT implement keyboard handling directly
 * - Button component does NOT check disabled prop directly
 * - All ARIA attributes are applied by foundation, not component
 */

export const BUTTON_A11Y_CONTRACT = {
  /**
   * Keyboard shortcuts that activate button
   */
  KEYBOARD_ACTIVATION: ['Enter', 'Space'] as const,

  /**
   * ARIA role for button
   */
  ROLE: 'button' as const,

  /**
   * How disabled state is communicated
   */
  DISABLED_ATTRIBUTES: {
    native: 'disabled' as const,
    asChild: 'aria-disabled' as const,
  },

  /**
   * Public styling hooks preserved on the host element.
   */
  DATA_ATTRIBUTES: {
    disabled: 'data-disabled' as const,
  },

  /**
   * Focus management rules
   */
  FOCUS_RULES: {
    enabled: 'focusable' as const,
    disabled: 'not-focusable' as const,
  },
} as const;

/**
 * Type-safe accessibility contract
 */
export type ButtonA11yContract = typeof BUTTON_A11Y_CONTRACT;
