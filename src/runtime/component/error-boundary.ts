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

/**
 * Where a control boundary (For/Show/Case) was materialized: the component
 * rendering at that point, and whether that output is an ErrorBoundary's
 * protected children (as opposed to its fallback, which belongs to the
 * enclosing boundary).
 */
export interface RenderedOutputOwner {
  instance: ComponentInstance;
  protectedByOwner: boolean;
}

const controlOutputOwners = new WeakMap<object, RenderedOutputOwner>();
const controlScopeStates = new WeakMap<ComponentInstance, object>();

/**
 * Record where `controlState` was materialized. A `null` owner (work running
 * outside any component render) keeps the owner already known.
 */
export function setControlOutputOwner(
  controlState: object,
  owner: RenderedOutputOwner | null
): void {
  if (owner) {
    controlOutputOwners.set(controlState, owner);
  }
}

export function getControlOutputOwner(
  controlState: object
): RenderedOutputOwner | null {
  return controlOutputOwners.get(controlState) ?? null;
}

/**
 * Control child scopes are owned by the component that created the control,
 * which can sit above the ErrorBoundary the control renders inside. Route their
 * failures through the control's output owner instead.
 */
export function bindControlScopeErrorOwner(
  scopeInstance: ComponentInstance,
  controlState: object
): void {
  controlScopeStates.set(scopeInstance, controlState);
}

function isLiveErrorBoundary(instance: ComponentInstance): boolean {
  return !!instance.errorBoundaryState && instance.notifyUpdate !== null;
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

function findLiveErrorBoundary(
  failedInstance: ComponentInstance
): ComponentInstance | null {
  const visited = new Set<ComponentInstance>();

  const visitFrom = (instance: ComponentInstance): ComponentInstance | null => {
    const control = controlScopeStates.get(instance);
    const controlOwner = control ? controlOutputOwners.get(control) : undefined;
    return (
      visit(getLivePortalErrorParent(instance)) ??
      (controlOwner
        ? controlOwner.protectedByOwner
          ? visit(controlOwner.instance)
          : visitAbove(controlOwner.instance)
        : null) ??
      visit(instance.parentInstance)
    );
  };

  const visitAbove = (
    instance: ComponentInstance
  ): ComponentInstance | null => {
    if (visited.has(instance)) {
      return null;
    }
    visited.add(instance);
    return visitFrom(instance);
  };

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

    return visitFrom(instance);
  };

  return visitAbove(failedInstance);
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
