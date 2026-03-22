/**
 * WAI-ARIA Disclosure Pattern (Collapsible)
 *
 * Specification: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
 *
 * A disclosure (collapsible) shows and hides a region of content via a button.
 * The button indicates the visibility state of the content region.
 *
 * ## Required ARIA
 * - Trigger: role="button" (native or explicit)
 * - Trigger: aria-expanded="true" | "false"
 * - Trigger: aria-controls={contentId}
 * - Content: id attribute for aria-controls reference
 *
 * ## Keyboard Support
 * - Enter: Toggles content visibility (on trigger)
 * - Space: Toggles content visibility (on trigger)
 *
 * ## Focus Management
 * - Trigger is focusable when not disabled
 * - Focus remains on trigger after activation
 * - Content is not focusable by default
 *
 * ## Disabled State
 * - Trigger cannot be activated when disabled
 * - Visual disabled styling (consumer responsibility)
 *
 * ## Presence
 * - Content unmounts when closed (default)
 * - Can force mount for animation/transition control
 */

export const COLLAPSIBLE_A11Y_CONTRACT = {
  /**
   * Trigger role
   *
   * Native buttons inherit role='button'.
   * Non-native elements (via asChild) MUST apply role='button'.
   */
  TRIGGER_ROLE: 'button' as const,

  /**
   * Keyboard activation keys
   *
   * Both Enter and Space must toggle the collapsible.
   */
  KEYBOARD_ACTIVATION: ['Enter', 'Space'] as const,

  /**
   * Expanded state attribute (on trigger)
   *
   * MUST be set to 'true' or 'false' to indicate content visibility.
   */
  EXPANDED_ATTRIBUTE: 'aria-expanded' as const,

  /**
   * Controls attribute (on trigger)
   *
   * MUST reference the id of the content region.
   */
  CONTROLS_ATTRIBUTE: 'aria-controls' as const,

  DATA_ATTRIBUTES: {
    slot: 'data-slot' as const,
    state: 'data-state' as const,
    disabled: 'data-disabled' as const,
  },

  /**
   * Content region requirements
   *
   * - MUST have id attribute for aria-controls reference
   * - Unmounted when closed (default behavior)
   * - Can force mount for animations
   */
  CONTENT_REQUIREMENTS: {
    idAttribute: 'required',
    defaultPresence: 'unmounted when closed',
  },

  /**
   * Focus rules
   *
   * - Focus stays on trigger after activation
   * - Content is not in tab order by default
   */
  FOCUS_RULES: {
    afterActivation: 'focus remains on trigger',
    contentFocusable: false,
  },
} as const;
