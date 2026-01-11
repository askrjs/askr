/*
 * Public exports for foundation primitives
 * Keep this file minimal — it's a convenience barrel for internal imports.
 */

// Structures
export { layout } from './structures/layout';
export type { LayoutComponent } from './structures/layout';

export { Slot } from './structures/slot';
export type { SlotProps } from './structures/slot';
export type { JSXElement } from '../jsx';

export { Presence } from './structures/presence';
export type { PresenceProps } from './structures/presence';

export { definePortal, DefaultPortal } from './structures/portal';
export type { Portal } from './structures/portal';

export { createCollection } from './structures/collection';
export type {
  Collection,
  CollectionItem,
} from './structures/collection';

export { createLayer } from './structures/layer';
export type {
  Layer,
  LayerManager,
  LayerOptions,
} from './structures/layer';

// Utilities
export { composeHandlers } from './utilities/compose-handlers';
export type { ComposeHandlersOptions } from './utilities/compose-handlers';

export { mergeProps } from './utilities/merge-props';

export { ariaDisabled, ariaExpanded, ariaSelected } from './utilities/aria';

export { composeRefs, setRef } from './utilities/compose-ref';
export type { Ref } from './utilities/compose-ref';

export { formatId } from './utilities/use-id';
export type { FormatIdOptions } from './utilities/use-id';

// State
export {
  isControlled,
  resolveControllable,
  makeControllable,
  controllableState,
} from './state/controllable';
export type { ControllableState } from './state/controllable';

// Interactions
export { pressable } from './interactions/pressable';
export type {
  PressableOptions,
  PressableResult,
} from './interactions/pressable';

export { dismissable } from './interactions/dismissable';
export type { DismissableOptions } from './interactions/dismissable';

export { focusable } from './interactions/focusable';
export type {
  FocusableOptions,
  FocusableResult,
} from './interactions/focusable';

export { hoverable } from './interactions/hoverable';
export type {
  HoverableOptions,
  HoverableResult,
} from './interactions/hoverable';

export { rovingFocus } from './interactions/roving-focus';
export type {
  RovingFocusOptions,
  RovingFocusResult,
  Orientation,
} from './interactions/roving-focus';

export {
  applyInteractionPolicy,
  mergeInteractionProps,
} from './interactions/interaction-policy';
export type { InteractionPolicyInput } from './interactions/interaction-policy';
