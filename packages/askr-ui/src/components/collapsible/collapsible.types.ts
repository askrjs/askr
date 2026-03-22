import type { JSXElement, Ref } from '@askrjs/askr/foundations';

/**
 * Collapsible component prop types
 *
 * ## Design
 * - Root owns open state (controlled or uncontrolled)
 * - Trigger toggles state via button semantics
 * - Content mounts/unmounts based on open state
 */

/**
 * Root component props
 */
export interface CollapsibleProps {
  /** Stable caller-provided identity used for ARIA linking when available */
  id?: string;
  /** Controlled open state */
  open?: boolean;
  /** Uncontrolled default open state */
  defaultOpen?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Child components (Trigger, Content) */
  children?: unknown;
  /** Whether the collapsible is disabled */
  disabled?: boolean;
}

/**
 * Trigger component props (button semantics)
 */
export interface CollapsibleTriggerProps extends Omit<
  JSX.IntrinsicElements['button'],
  'children' | 'ref'
> {
  /** Render as child element instead of button */
  asChild?: false;
  /** Child content */
  children?: unknown;
  /** Ref forwarding */
  ref?: Ref<HTMLButtonElement>;
}

export interface CollapsibleTriggerAsChildProps {
  /** Render as child element instead of button */
  asChild: true;
  /** Child content */
  children: JSXElement;
  /** Ref forwarding */
  ref?: Ref<unknown>;
}

/**
 * Content component props
 */
export interface CollapsibleContentProps extends Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> {
  /** Render as child element instead of div */
  asChild?: false;
  /** Child content */
  children?: unknown;
  /** Force mount even when closed (for animation) */
  forceMount?: boolean;
  /** Ref forwarding */
  ref?: Ref<HTMLDivElement>;
}

export interface CollapsibleContentAsChildProps {
  /** Render as child element instead of div */
  asChild: true;
  /** Child content */
  children: JSXElement;
  /** Force mount even when closed (for animation) */
  forceMount?: boolean;
  /** Ref forwarding */
  ref?: Ref<unknown>;
}
