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

    if (isLiveErrorBoundary(instance)) {
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

function isLiveErrorBoundary(instance: ComponentInstance): boolean {
  return !!instance.errorBoundaryState && instance.notifyUpdate !== null;
}

/** Route a scheduled component failure to its nearest live render boundary. */
export function routeComponentErrorToBoundary(
  failedInstance: ComponentInstance,
  error: unknown
): boolean {
  const boundary = findLiveErrorBoundary(failedInstance);
  if (!boundary) {
    return false;
  }
  notifyErrorBoundary(boundary, error);
  return true;
}

/**
 * Whether output rendered in `owner`'s scope right now is protected by `owner`
 * itself: true for an ErrorBoundary's children, false for its fallback (which
 * belongs to the enclosing boundary) and for ordinary components.
 */
export function isRenderingProtectedBoundaryContent(
  owner: ComponentInstance
): boolean {
  return !!owner.errorBoundaryState && owner.errorBoundaryState.error == null;
}

/**
 * Route a failure from output rendered in `owner`'s scope. Output protected by
 * `owner` (see isRenderingProtectedBoundaryContent) goes to `owner`; anything
 * else goes to the nearest boundary above it.
 */
export function routeRenderedOutputErrorToBoundary(
  owner: ComponentInstance,
  error: unknown,
  protectedByOwner: boolean
): boolean {
  if (protectedByOwner && isLiveErrorBoundary(owner)) {
    notifyErrorBoundary(owner, error);
    return true;
  }
  return routeComponentErrorToBoundary(owner, error);
}

function notifyErrorBoundary(
  boundary: ComponentInstance,
  error: unknown
): void {
  const onError = boundary.props.onError;
  reportBoundaryError(
    boundary,
    error,
    typeof onError === 'function'
      ? (onError as (nextError: unknown) => void)
      : undefined
  );
  boundary._enqueueRun?.();
}
