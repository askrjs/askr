/**
 * dismissable
 *
 * THE dismissal primitive. Handles Escape key and outside interactions.
 *
 * INVARIANTS:
 * 1. Returns props that compose via mergeProps (no factories)
 * 2. Disabled state respected exactly once, here
 * 3. No side effects - pure props generation
 * 4. Outside detection requires explicit node reference
 * 5. This is the ONLY dismissal primitive - do not create alternatives
 *
 * DESIGN:
 * - Returns standard event handler props (onKeyDown, onPointerDownCapture)
 * - Composable via mergeProps with other foundations
 * - Caller provides node reference for outside detection
 * - Single onDismiss callback for all dismiss triggers
 *
 * PIT OF SUCCESS:
 * ✓ Can't accidentally bypass (only way to get dismiss behavior)
 * ✓ Can't duplicate (disabled checked once)
 * ✓ Composes via mergeProps (standard props)
 * ✓ Wrong usage is hard (no factories to misuse)
 *
 * USAGE:
 *   const props = dismissable({
 *     node: elementRef,
 *     disabled: false,
 *     onDismiss: () => close()
 *   });
 *
 *   <div ref={elementRef} {...props}>Content</div>
 *
 * MISUSE EXAMPLE (PREVENTED):
 *   ❌ Can't forget to check disabled - checked inside dismissable
 *   ❌ Can't create custom escape handler - this is the only one
 *   ❌ Can't bypass via direct event listeners - mergeProps composes correctly
 */

export interface DismissableOptions {
  /**
   * Reference to the element for outside click detection
   */
  node?: Node | null;

  /**
   * Whether dismiss is disabled
   */
  disabled?: boolean;

  /**
   * Called when dismiss is triggered (Escape or outside click)
   */
  onDismiss?: (trigger: 'escape' | 'outside') => void;
}

import type {
  KeyboardLikeEvent,
  PointerLikeEvent,
} from '../utilities/event-types';

export function dismissable({
  node,
  disabled,
  onDismiss,
}: DismissableOptions) {
  function handleKeyDown(e: KeyboardLikeEvent) {
    if (disabled) return;
    if (e.key === 'Escape') {
      e.preventDefault?.();
      e.stopPropagation?.();
      onDismiss?.('escape');
    }
  }

  function handlePointerDownCapture(e: PointerLikeEvent) {
    if (disabled) return;
    
    const target = e.target;
    if (!(target instanceof Node)) return;

    // If no node provided, can't detect outside clicks
    if (!node) return;

    // Check if click is outside
    if (!node.contains(target)) {
      onDismiss?.('outside');
    }
  }

  return {
    onKeyDown: handleKeyDown,
    // Use capture phase to catch events before they bubble
    onPointerDownCapture: handlePointerDownCapture,
  };
}
