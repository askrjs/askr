import type { Props } from './props';
import type { VNode } from './vnode';

export type ErrorBoundaryContent = VNode | readonly VNode[];
export type ErrorBoundaryFallbackValue = ErrorBoundaryContent | Node;

export type ErrorBoundaryFallbackRender = (
  error: unknown,
  reset: () => void
) => ErrorBoundaryFallbackValue;

export interface ErrorBoundaryProps extends Props {
  children?: ErrorBoundaryContent;
  fallback?: ErrorBoundaryFallbackValue | ErrorBoundaryFallbackRender;
  onError?: (error: unknown) => void;
  resetKey?: unknown;
}
