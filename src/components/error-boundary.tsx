import type {
  ErrorBoundaryFallbackRender,
  ErrorBoundaryProps,
} from '../common/error-boundary';
import { ELEMENT_TYPE, type JSXElement } from '../common/jsx';
import { __ERROR_BOUNDARY__ } from '../common/vnode';
import {
  getCurrentComponentInstance,
  type ComponentInstance,
} from '../runtime';

export type { ErrorBoundaryFallbackRender, ErrorBoundaryProps };

type ErrorBoundaryState = NonNullable<ComponentInstance['errorBoundaryState']>;

type ErrorBoundaryVNode = JSXElement & {
  __instance?: ComponentInstance;
};

function ensureBoundaryState(
  instance: ComponentInstance,
  resetKey: unknown
): ErrorBoundaryState {
  const boundaryState =
    instance.errorBoundaryState ??
    (instance.errorBoundaryState = {
      error: null,
      resetKey,
      notified: false,
    });

  if (!Object.is(boundaryState.resetKey, resetKey)) {
    boundaryState.error = null;
    boundaryState.resetKey = resetKey;
    boundaryState.notified = false;
  }

  return boundaryState;
}

function createBoundaryVNode(
  instance: ComponentInstance,
  props: ErrorBoundaryProps
): ErrorBoundaryVNode {
  const key =
    typeof props.key === 'symbol'
      ? null
      : ((props.key ?? null) as string | number | null);

  return {
    $$typeof: ELEMENT_TYPE,
    type: __ERROR_BOUNDARY__,
    props: {
      children: props.children,
      fallback: props.fallback,
      onError: props.onError,
      resetKey: props.resetKey,
    },
    key,
    __instance: instance,
  };
}

/**
 * Creates a boundary for descendant mount and post-mount render/commit errors,
 * including content materialized through a portal host.
 */
export function ErrorBoundary(props: ErrorBoundaryProps): JSXElement {
  const instance = getCurrentComponentInstance();
  if (!instance) {
    throw new Error(
      '[Askr] ErrorBoundary() can only be used during component render execution.'
    );
  }

  ensureBoundaryState(instance, props.resetKey);
  return createBoundaryVNode(instance, props);
}

export function isErrorBoundaryVNode(
  value: unknown
): value is ErrorBoundaryVNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as ErrorBoundaryVNode).type === __ERROR_BOUNDARY__
  );
}

export function resolveErrorBoundaryState(
  vnode: ErrorBoundaryVNode
): ErrorBoundaryState | null {
  return vnode.__instance?.errorBoundaryState ?? null;
}
