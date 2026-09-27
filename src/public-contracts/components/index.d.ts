import { VNode } from '../core.js';
import { JSXElement, Props } from '../elements.js';
type ErrorBoundaryContent = VNode | readonly VNode[];
type ErrorBoundaryFallbackValue = ErrorBoundaryContent | Node;
/** A child of an {@link ErrorBoundary}; a raw DOM `Node` is not a child. */
type ErrorBoundaryChild =
  | VNode
  | JSXElement
  | (() => unknown)
  | readonly ErrorBoundaryChild[];
/** Renders a fallback for the caught error; call `reset` to retry the children. */
type ErrorBoundaryFallbackRender = (
  error: unknown,
  reset: () => void
) => ErrorBoundaryFallbackValue;
/** Props for {@link ErrorBoundary}. */
interface ErrorBoundaryProps extends Props {
  /** Boundary content: nodes, elements, function children, or a list of them. */
  children?: ErrorBoundaryChild;
  /** Static fallback content, or a render function receiving the error and a reset callback. */
  fallback?: ErrorBoundaryFallbackValue | ErrorBoundaryFallbackRender;
  /** Called with the caught error when the boundary trips. */
  onError?: (error: unknown) => void;
  /** Changing this value resets the boundary, re-rendering the children. */
  resetKey?: unknown;
}
/**
 * Creates a boundary for descendant mount and post-mount render/commit errors,
 * including content materialized through a portal host.
 */
declare function ErrorBoundary(props: ErrorBoundaryProps): JSXElement;
export {
  ErrorBoundary,
  type ErrorBoundaryFallbackRender,
  type ErrorBoundaryProps,
};
