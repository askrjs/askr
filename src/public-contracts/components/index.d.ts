import { VNode } from '../core.js';
import { JSXElement, Props } from '../elements.js';
type ErrorBoundaryContent = VNode | readonly VNode[];
type ErrorBoundaryFallbackValue = ErrorBoundaryContent | Node;
/** Renders a fallback for the caught error; call `reset` to retry the children. */
type ErrorBoundaryFallbackRender = (
  error: unknown,
  reset: () => void
) => ErrorBoundaryFallbackValue;
/** Props for {@link ErrorBoundary}. */
interface ErrorBoundaryProps extends Props {
  children?: ErrorBoundaryContent;
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
