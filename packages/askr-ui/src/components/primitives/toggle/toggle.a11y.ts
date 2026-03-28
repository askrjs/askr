/**
 * WAI-ARIA Toggle Button Pattern
 *
 * Specification: https://www.w3.org/WAI/ARIA/apg/patterns/button/
 *
 * A toggle button is a two-state button that can be either on or off.
 * Uses aria-pressed to communicate toggle state to assistive technology.
 *
 * ## Required ARIA
 * - aria-pressed: 'true' | 'false' (indicates toggle state)
 * - role: 'button' (when not native button)
 *
 * ## Keyboard Support
 * - Enter: Activates toggle (on native button and non-button elements)
 * - Space: Activates toggle
 *
 * ## Focus Management
 * - Toggle is focusable when not disabled
 * - Visual focus indicator required
 *
 * ## Disabled State
 * - aria-disabled when disabled=true
 * - Removed from tab order
 * - Visual disabled styling (consumer responsibility)
 */

export const TOGGLE_A11Y_CONTRACT = {
  /**
   * ARIA role
   *
   * Native buttons inherit role='button'.
   * Non-native elements (via asChild) MUST apply role='button'.
   */
  ROLE: 'button' as const,

  /**
   * Keyboard activation keys
   *
   * Both Enter and Space must activate toggle.
   * Foundation handles implementation.
   */
  KEYBOARD_ACTIVATION: ['Enter', 'Space'] as const,

  /**
   * Pressed state attribute
   *
   * MUST be set to 'true' or 'false' (never undefined).
   * Defaults to 'false' when pressed prop is undefined.
   */
  PRESSED_ATTRIBUTE: 'aria-pressed' as const,

  /**
   * Disabled state attributes
   *
   * When disabled=true:
   * - Native button: disabled attribute + aria-disabled='true'
   * - Non-native: aria-disabled='true' + tabIndex=-1
   */
  DISABLED_ATTRIBUTES: {
    nativeButton: {
      disabled: true,
      'aria-disabled': 'true' as const,
    },
    nonNative: {
      'aria-disabled': 'true' as const,
      tabIndex: -1,
    },
  },

  /**
   * Public styling hooks preserved on the host element.
   */
  DATA_ATTRIBUTES: {
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
  },

  /**
   * Focus rules
   *
   * - Enabled: in tab order (tabIndex >= 0)
   * - Disabled: removed from tab order (tabIndex = -1)
   * - Focus ring MUST be visible
   */
  FOCUS_RULES: {
    enabled: 'tabIndex >= 0',
    disabled: 'tabIndex = -1',
    visualIndicator: 'required',
  },
} as const;
