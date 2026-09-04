import { Ref } from '../../refs.js';
import {
  KeyboardLikeEvent,
  PointerLikeEvent,
  DefaultPreventable,
  PropagationStoppable,
} from '../../utilities.js';
/**
 * pressable
 *
 * Interaction helper that produces VNode props for 'press' semantics.
 * - Pure and deterministic: no DOM construction or mutation here
 * - The runtime owns event attachment and scheduling
 * - This helper returns plain props (handlers) intended to be attached by the runtime
 *
 * Behaviour:
 * - For native buttons: only an `onClick` prop is provided (no ARIA or keyboard shims)
 * - For non-button elements: add `role="button"` and `tabIndex` and keyboard handlers
 * - Activation: `Enter` activates on keydown, `Space` activates on keyup (matches native button)
 * - Disabled: handlers short-circuit and `aria-disabled` is set for all hosts
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Activation Timing (Platform Parity)
 *    - Enter fires on keydown (immediate response)
 *    - Space fires on keyup (allows cancel by moving focus, matches native)
 *    - Space keydown prevents scroll (matches native button behavior)
 *
 * 2. Disabled Enforcement Strategy
 *    - Native buttons: Use HTML `disabled` attribute (platform-enforced non-interactivity)
 *                     AND `aria-disabled` (consistent a11y signaling)
 *    - Non-native: Use `tabIndex=-1` (removes from tab order)
 *                  AND `aria-disabled` (signals disabled state to AT)
 *    - Click handler short-circuits as defense-in-depth (prevents leaked focus issues)
 *
 * 3. Key Repeat Behavior
 *    - Held Enter/Space will fire onPress repeatedly (matches native button)
 *    - No debouncing or repeat prevention (platform parity)
 */
/** Options for {@link pressable}. */
interface PressableOptions {
  disabled?: boolean;
  onPress?: (e: PressEvent) => void;
  /**
   * Whether the host is a native button. Defaults to false.
   */
  isNativeButton?: boolean;
}
type PressEvent = DefaultPreventable & PropagationStoppable;
/** Element props returned by {@link pressable}. */
interface PressableResult {
  onClick: (e: PressEvent) => void;
  disabled?: true;
  role?: 'button';
  tabIndex?: number;
  onKeyDown?: (e: KeyboardLikeEvent) => void;
  onKeyUp?: (e: KeyboardLikeEvent) => void;
  'aria-disabled'?: 'true';
}
/** Produce click/keyboard props implementing 'press' semantics for an element. */
declare function pressable({
  disabled,
  onPress,
  isNativeButton,
}: PressableOptions): PressableResult;
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
 * - Caller provides the protected node reference for outside detection
 * - Portaled descendants are registered explicitly as additional inside nodes
 * - Returned capture props must be attached to a surface that can observe both
 *   the protected subtree and the outside interaction path (for example, an
 *   overlay or wrapper around the protected node)
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
 *     additionalInsideNodes: [dropdownPortalRef],
 *     disabled: false,
 *     onDismiss: () => close()
 *   });
 *
 *   <div {...props}>
 *     <div ref={elementRef}>Content</div>
 *   </div>
 *
 * MISUSE EXAMPLE (PREVENTED):
 *   ❌ Can't forget to check disabled - checked inside dismissable
 *   ❌ Can't create custom escape handler - this is the only one
 *   ❌ Can't bypass via direct event listeners - mergeProps composes correctly
 */
/** Options for {@link dismissable}. */
interface DismissableOptions {
  /**
   * Reference to the protected element for outside click detection. Attach the
   * returned capture props to a surface that encloses this node.
   */
  node?: Node | null;
  /**
   * Additional roots that are logically inside the protected surface even
   * when a portal places them outside `node` in the DOM tree.
   */
  additionalInsideNodes?: readonly (Node | null | undefined)[];
  /**
   * Whether dismiss is disabled
   */
  disabled?: boolean;
  /**
   * Called when dismiss is triggered (Escape or outside click)
   */
  onDismiss?: (trigger: 'escape' | 'outside') => void;
}
/** Produce keydown/outside-click props that invoke `onDismiss` on Escape or an outside click. */
declare function dismissable({
  node,
  additionalInsideNodes,
  disabled,
  onDismiss,
}: DismissableOptions): {
  onKeyDown: (e: KeyboardLikeEvent) => void;
  onPointerDownCapture: (e: PointerLikeEvent) => void;
};
/**
 * focusable
 *
 * Normalize focus-related props for hosts.
 * - No DOM manipulation here; returns props that the runtime may attach.
 */
/** Options for {@link focusable}. */
interface FocusableOptions {
  disabled?: boolean;
  tabIndex?: number | undefined;
}
/** Element props returned by {@link focusable}. */
interface FocusableResult {
  tabIndex?: number;
  'aria-disabled'?: 'true';
}
/** Normalize `tabIndex`/`aria-disabled` props for a focusable host. */
declare function focusable({
  disabled,
  tabIndex,
}: FocusableOptions): FocusableResult;
/**
 * hoverable
 *
 * Produces props for pointer enter/leave handling. Pure and deterministic.
 */
/** Options for {@link hoverable}. */
interface HoverableOptions {
  disabled?: boolean;
  onEnter?: (e: HoverEvent) => void;
  onLeave?: (e: HoverEvent) => void;
}
type HoverEvent = DefaultPreventable & PropagationStoppable;
/** Element props returned by {@link hoverable}. */
interface HoverableResult {
  onPointerEnter?: (e: HoverEvent) => void;
  onPointerLeave?: (e: HoverEvent) => void;
}
/** Produce pointer enter/leave props that call `onEnter`/`onLeave` unless disabled. */
declare function hoverable({
  disabled,
  onEnter,
  onLeave,
}: HoverableOptions): HoverableResult;
/** Arrow-key axis for {@link rovingFocus}. */
type Orientation = 'horizontal' | 'vertical' | 'both';
/** Options for {@link rovingFocus}. */
interface RovingFocusOptions {
  /**
   * Current focused index
   */
  currentIndex: number;
  /**
   * Total number of items
   */
  itemCount: number;
  /**
   * Navigation orientation
   * - horizontal: ArrowLeft/ArrowRight
   * - vertical: ArrowUp/ArrowDown
   * - both: all arrow keys
   */
  orientation?: Orientation;
  /**
   * Whether to loop when reaching the end
   */
  loop?: boolean;
  /**
   * Callback when navigation occurs
   */
  onNavigate?: (index: number) => void;
  /**
   * Optional disabled state check per index
   */
  isDisabled?: (index: number) => boolean;
}
/** Container and per-item props returned by {@link rovingFocus}. */
interface RovingFocusResult {
  /**
   * Props for the container element (composes via mergeProps)
   */
  container: {
    onKeyDown: (e: KeyboardLikeEvent) => void;
  };
  /**
   * Generate props for an item at the given index (composes via mergeProps)
   */
  item: (index: number) => {
    tabIndex: number;
    'data-roving-index': number;
  };
}
/** Implement arrow-key roving tabindex navigation over a set of items. */
declare function rovingFocus(options: RovingFocusOptions): RovingFocusResult;
/**
 * USAGE EXAMPLE:
 *
 * function Menu() {
 *   const [focusIndex, setFocusIndex] = state(0);
 *   const items = ['File', 'Edit', 'View'];
 *
 *   const navigation = rovingFocus({
 *     currentIndex: focusIndex(),
 *     itemCount: items.length,
 *     orientation: 'horizontal',
 *     loop: true,
 *     onNavigate: setFocusIndex,
 *   });
 *
 *   return (
 *     <div {...navigation.container}>
 *       {items.map((label, index) => (
 *         <button {...navigation.item(index)}>
 *           {label}
 *         </button>
 *       ))}
 *     </div>
 *   );
 * }
 */
/** Input to {@link applyInteractionPolicy}. */
interface InteractionPolicyInput {
  /** Whether the host element is a native interactive element (button, a, etc) */
  isNative: boolean;
  /** Disabled state - checked ONLY here, never in components */
  disabled: boolean;
  /** User-provided press handler - semantic action, not DOM event */
  onPress?: (e: Event) => void;
  /** Optional ref to compose */
  ref?: Ref<unknown>;
}
/**
 * THE interaction policy. Components MUST use this, NEVER implement
 * interaction logic directly.
 */
declare function applyInteractionPolicy({
  isNative,
  disabled,
  onPress,
  ref,
}: InteractionPolicyInput):
  | {
      disabled: true | undefined;
      onClick: (e: Event) => void;
      ref: Ref<unknown>;
    }
  | {
      tabIndex: number;
      ref: Ref<unknown>;
      'aria-disabled'?: 'true';
      onClick: (e: DefaultPreventable & PropagationStoppable) => void;
      disabled?: true;
      role?: 'button';
      onKeyDown?: (e: KeyboardLikeEvent) => void;
      onKeyUp?: (e: KeyboardLikeEvent) => void;
    };
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
declare function mergeInteractionProps(
  childProps: Record<string, unknown>,
  policyProps: Record<string, unknown>,
  userProps?: Record<string, unknown>
): Record<string, unknown>;
export {
  type DismissableOptions,
  type FocusableOptions,
  type FocusableResult,
  type HoverableOptions,
  type HoverableResult,
  type InteractionPolicyInput,
  type Orientation,
  type PressableOptions,
  type PressableResult,
  type RovingFocusOptions,
  type RovingFocusResult,
  applyInteractionPolicy,
  dismissable,
  focusable,
  hoverable,
  mergeInteractionProps,
  pressable,
  rovingFocus,
};
