import { logger } from '../../common/logger';
import { type ComponentInstance } from './instance';
import { getLivePortalErrorParent } from './scope';

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

function findLiveErrorBoundary(
  failedInstance: ComponentInstance
): ComponentInstance | null {
  const visited = new Set<ComponentInstance>([failedInstance]);

  const visit = (
    instance: ComponentInstance | null
  ): ComponentInstance | null => {
    if (!instance || visited.has(instance)) {
      return null;
    }
    visited.add(instance);

    if (instance.errorBoundaryState && instance.notifyUpdate !== null) {
      return instance;
    }

    return (
      visit(getLivePortalErrorParent(instance)) ??
      visit(instance.parentInstance)
    );
  };

  return (
    visit(getLivePortalErrorParent(failedInstance)) ??
    visit(failedInstance.parentInstance)
  );
}

function routeErrorToLiveBoundary(
  boundary: ComponentInstance | null,
  error: unknown
): boolean {
  if (!boundary) {
    return false;
  }

  const onError = boundary.props.onError;
  reportBoundaryError(
    boundary,
    error,
    typeof onError === 'function'
      ? (onError as (nextError: unknown) => void)
      : undefined
  );
  boundary._enqueueRun?.();
  return true;
}

/** Route a scheduled component failure to its nearest live render boundary. */
export function routeComponentErrorToBoundary(
  failedInstance: ComponentInstance,
  error: unknown
): boolean {
  return routeErrorToLiveBoundary(findLiveErrorBoundary(failedInstance), error);
}

/**
 * Route a failure of work rendered in `renderInstance`'s output (such as a
 * control boundary's local commit) to the nearest live boundary, including
 * `renderInstance` itself when it is a boundary.
 */
export function routeRenderedWorkErrorToBoundary(
  renderInstance: ComponentInstance,
  error: unknown
): boolean {
  const boundary =
    renderInstance.errorBoundaryState && renderInstance.notifyUpdate !== null
      ? renderInstance
      : findLiveErrorBoundary(renderInstance);
  return routeErrorToLiveBoundary(boundary, error);
}
