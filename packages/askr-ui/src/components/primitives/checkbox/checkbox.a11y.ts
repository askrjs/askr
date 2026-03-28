/**
 * WAI-ARIA Checkbox Pattern
 *
 * Specification: https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/
 *
 * A checkbox is an input mechanism that allows users to select one or more items
 * from a set. Unlike toggle buttons, checkboxes visually represent a checked state
 * with aria-checked (not aria-pressed).
 *
 * ## Required ARIA
 * - aria-checked: 'true' | 'false' | 'mixed' (indicates checkbox state)
 * - role: 'checkbox' (when not native input)
 *
 * ## Keyboard Support
 * - Enter: Activates checkbox (on non-input elements)
 * - Space: Activates checkbox
 *
 * ## Focus Management
 * - Checkbox is focusable when not disabled
 * - Visual focus indicator required
 *
 * ## Disabled State
 * - aria-disabled when disabled=true (for non-native)
 * - disabled attribute when native input
 * - Removed from tab order
 * - Visual disabled styling (consumer responsibility)
 *
 * ## Indeterminate State
 * - aria-checked='mixed' for visually indeterminate state
 * - Typically used for "select all" checkboxes when partial selection
 */

export const CHECKBOX_A11Y_CONTRACT = {
  /**
   * ARIA role
   *
   * Native inputs inherit role='checkbox'.
   * Non-native elements (via asChild) MUST apply role='checkbox'.
   */
  ROLE: 'checkbox' as const,

  /**
   * Keyboard activation keys
   *
   * Both Enter and Space must activate checkbox.
   * Foundation handles implementation.
   */
  KEYBOARD_ACTIVATION: ['Enter', 'Space'] as const,

  /**
   * Checked state attribute
   *
   * MUST be set to 'true', 'false', or 'mixed' (never undefined).
   * - 'true': checked
   * - 'false': unchecked
   * - 'mixed': indeterminate (visually ambiguous)
   *
   * Defaults to 'false' when checked prop is undefined.
   */
  CHECKED_ATTRIBUTE: 'aria-checked' as const,

  /**
   * Indeterminate state
   *
   * When indeterminate=true:
   * - aria-checked='mixed'
   * - Visual indeterminate indicator (consumer responsibility)
   * - Does NOT affect checked state (orthogonal)
   */
  INDETERMINATE_VALUE: 'mixed' as const,

  /**
   * Disabled state attributes
   *
   * When disabled=true:
   * - Native input: disabled attribute
   * - Non-native: aria-disabled='true' + tabIndex=-1
   */
  DISABLED_ATTRIBUTES: {
    nativeInput: {
      disabled: true,
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
