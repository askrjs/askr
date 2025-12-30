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

// Utilities
export { composeHandlers } from './utilities/composeHandlers';
export type { ComposeHandlersOptions } from './utilities/composeHandlers';

export { mergeProps } from './utilities/mergeProps';

export {
	ariaDisabled,
	ariaExpanded,
	ariaSelected,
} from './utilities/aria';

export { composeRefs, setRef } from './utilities/composeRef';
export type { Ref } from './utilities/composeRef';

export { useId } from './utilities/useId';

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
export type { PressableOptions, PressableResult } from './interactions/pressable';

export { dismissable } from './interactions/dismissable';
export type { DismissableOptions } from './interactions/dismissable';

export { focusable } from './interactions/focusable';
export type { FocusableOptions, FocusableResult } from './interactions/focusable';

export { hoverable } from './interactions/hoverable';
export type { HoverableOptions, HoverableResult } from './interactions/hoverable';
