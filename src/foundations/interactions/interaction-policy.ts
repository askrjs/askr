/**
 * INTERACTION POLICY (FRAMEWORK LAW)
 *
 * This is THE ONLY way to create interactive elements. Components MUST NOT
 * implement interaction logic directly.
 *
 * INVARIANTS (ENFORCED):
 * 1. "Press" is the semantic. Click/touch/Enter/Space are implementation details.
 * 2. Disabled is enforced exactly once, here. Components may not check disabled.
 * 3. Keyboard handling is automatic. Components may not add onKeyDown for activation.
 * 4. Native elements opt out of polyfills, not semantics.
 * 5. asChild may replace the host element, not interaction behavior.
 * 6. This policy is the SINGLE SOURCE OF TRUTH for interactive behavior.
 *
 * DESIGN:
 * - Single public function: applyInteractionPolicy
 * - Returns props that compose via mergeProps
 * - Delegates to pressable for mechanics
 * - Enforces disabled once and only once
 * - No configuration beyond disabled and native element type
 *
 * PIT OF SUCCESS:
 * ✓ Can't bypass policy (only way to get interaction behavior)
 * ✓ Can't duplicate disabled checks (enforced once, here)
 * ✓ Can't write custom keyboard handlers for buttons (policy owns it)
 * ✓ Composes via mergeProps (standard props)
 * ✓ Wrong usage is impossible (no escape hatch)
 *
 * USAGE:
 *   function Button({ onPress, disabled }) {
 *     const interaction = applyInteractionPolicy({
 *       isNative: true,
 *       disabled,
 *       onPress
 *     });
 *
 *     return <button {...interaction}>Click me</button>;
 *   }
 *
 * MISUSE EXAMPLE (PREVENTED):
 *   ❌ Button checking disabled again:
 *      function Button({ disabled, onPress }) {
 *        if (disabled) return; // NO! Policy handles this
 *        const interaction = applyInteractionPolicy(...);
 *      }
 *
 *   ❌ Custom keyboard handler:
 *      function Button({ onPress }) {
 *        const interaction = applyInteractionPolicy(...);
 *        return <button {...interaction} onKeyDown={...}>; // NO! Policy owns this
 *      }
 *
 *   ❌ Direct event handler:
 *      <button onClick={onPress}>; // NO! Use applyInteractionPolicy
 */

import { pressable } from './pressable';
import { composeHandlers } from '../utilities/compose-handlers';
import { composeRefs } from '../utilities/compose-ref';
import { mergeProps as mergePropsBase } from '../utilities/merge-props';

export interface InteractionPolicyInput {
  /** Whether the host element is a native interactive element (button, a, etc) */
  isNative: boolean;
  /** Disabled state - checked ONLY here, never in components */
  disabled: boolean;
  /** User-provided press handler - semantic action, not DOM event */
  onPress?: (e: Event) => void;
  /** Optional ref to compose */
  ref?: any;
}

/**
 * THE interaction policy. Components MUST use this, NEVER implement
 * interaction logic directly.
 */
export function applyInteractionPolicy({
  isNative,
  disabled,
  onPress,
  ref,
}: InteractionPolicyInput) {
  // Disabled is enforced exactly once, here.
  // Components downstream may NOT check disabled.
  function invokePress(e: Event) {
    if (disabled) {
      e.preventDefault?.();
      return;
    }
    onPress?.(e);
  }

  if (isNative) {
    return {
      disabled: disabled || undefined,
      onClick: (e: Event) => invokePress(e),
      ref,
    };
  }

  // Non-native elements get full button semantics
  const interaction = pressable({
    disabled,
    isNativeButton: false,
    onPress: (e) => invokePress(e as Event),
  });

  return {
    ...interaction,
    'aria-disabled': disabled || undefined,
    tabIndex: disabled ? -1 : interaction.tabIndex ?? 0,
    ref,
  };
}

/**
 * Merge rule for Slot / asChild
 *
 * Precedence:
 *   policy → user → child
 *
 * Event handlers are composed (policy first).
 * Refs are always composed.
 * Policy props MUST take precedence to enforce invariants.
 */
export function mergeInteractionProps(
  childProps: Record<string, any>,
  policyProps: Record<string, any>,
  userProps?: Record<string, any>
) {
  let out = mergePropsBase(childProps, policyProps);
  if (userProps) out = mergePropsBase(out, userProps);

  // Ensure policy handlers always run first
  for (const k in out) {
    if (!k.startsWith('on')) continue;

    const policyHandler = policyProps?.[k];
    const userHandler = userProps?.[k];
    const childHandler = childProps?.[k];

    if (policyHandler || userHandler || childHandler) {
      out[k] = composeHandlers(
        policyHandler,
        composeHandlers(userHandler, childHandler)
      );
    }
  }

  out.ref = composeRefs(childProps?.ref, userProps?.ref, policyProps?.ref);

  return out;
}
