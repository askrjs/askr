import type { Props } from './props';
import type { JSXElement } from './jsx';
import type { VNode } from './vnode';

export type ErrorBoundaryContent = VNode | readonly VNode[];
export type ErrorBoundaryFallbackValue = ErrorBoundaryContent | Node;
/** A child of an {@link ErrorBoundary}; a raw DOM `Node` is not a child. */
export type ErrorBoundaryChild =
  | VNode
  | JSXElement
  | (() => unknown)
  | readonly ErrorBoundaryChild[];

/** Renders a fallback for the caught error; call `reset` to retry the children. */
export type ErrorBoundaryFallbackRender = (
  error: unknown,
  reset: () => void
) => ErrorBoundaryFallbackValue;

/** Props for {@link ErrorBoundary}. */
export interface ErrorBoundaryProps extends Props {
  /** Boundary content: nodes, elements, function children, or a list of them. */
  children?: ErrorBoundaryChild;
  /** Static fallback content, or a render function receiving the error and a reset callback. */
  fallback?: ErrorBoundaryFallbackValue | ErrorBoundaryFallbackRender;
  /** Called with the caught error when the boundary trips. */
  onError?: (error: unknown) => void;
  /** Changing this value resets the boundary, re-rendering the children. */
  resetKey?: unknown;
}
