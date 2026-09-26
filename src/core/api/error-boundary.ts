/**
 * ErrorBoundary: catches render failures in its subtree (and lifecycle
 * failures delivered to it) and renders a fallback until reset.
 */

import type {
  ErrorBoundaryFallbackRender,
  ErrorBoundaryProps,
} from '../../common/error-boundary';
import { logger } from '../../common/logger';
import { requireInstance } from '../component/instance';
import { hookSlot } from './hooks';

export type { ErrorBoundaryFallbackRender, ErrorBoundaryProps };

interface BoundarySlot {
  caught: boolean;
  error: unknown;
  resetKey: unknown;
}

export function ErrorBoundary(props: ErrorBoundaryProps): unknown {
  const instance = requireInstance('ErrorBoundary()');
  const slot = hookSlot<BoundarySlot>(instance, 'errorBoundary', () => ({
    caught: false,
    error: undefined,
    resetKey: props.resetKey,
  }));
  if (!Object.is(slot.resetKey, props.resetKey)) {
    slot.resetKey = props.resetKey;
    slot.caught = false;
    slot.error = undefined;
  }

  instance.boundary = (error) => {
    // A failure while showing the fallback belongs to an outer boundary.
    if (slot.caught) return false;
    slot.caught = true;
    slot.error = error;
    try {
      props.onError?.(error);
    } catch (hookError) {
      logger.error('[Askr] ErrorBoundary onError handler threw:', hookError);
    }
    logger.error('[Askr] ErrorBoundary caught render error:', error);
    return true;
  };

  if (!slot.caught) return props.children;

  const reset = () => {
    if (!slot.caught) return;
    slot.caught = false;
    slot.error = undefined;
    instance.computation.invalidate();
  };
  const fallback = props.fallback;
  return typeof fallback === 'function'
    ? (fallback as ErrorBoundaryFallbackRender)(slot.error, reset)
    : (fallback ?? null);
}
