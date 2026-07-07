import { logger } from '../common/logger';
import type { ComponentInstance } from './component';

export function createBoundaryReset(instance: ComponentInstance): () => void {
  return () => {
    const boundaryState = instance.errorBoundaryState;
    if (!boundaryState) {
      return;
    }
    boundaryState.error = null;
    boundaryState.notified = false;
    queueMicrotask(() => {
      instance._enqueueRun?.();
    });
  };
}

export function reportBoundaryError(
  instance: ComponentInstance,
  error: unknown,
  onError?: (error: unknown) => void
): void {
  const boundaryState = instance.errorBoundaryState;
  if (
    boundaryState &&
    Object.is(boundaryState.error, error) &&
    boundaryState.notified
  ) {
    return;
  }

  if (boundaryState) {
    boundaryState.error = error;
    boundaryState.notified = true;
  }

  try {
    onError?.(error);
  } catch (hookError) {
    logger.error('[Askr] ErrorBoundary onError handler threw:', hookError);
  }

  logger.error('[Askr] ErrorBoundary caught render error:', error);
}
