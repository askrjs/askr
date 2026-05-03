import type { Props } from '../common/props';
import { ELEMENT_TYPE, type JSXElement } from '../common/jsx';
import { __ERROR_BOUNDARY__ } from '../common/vnode';
import {
  getCurrentComponentInstance,
  type ComponentInstance,
} from '../runtime/component';
import { logger } from '../dev/logger';
import { isDevelopmentEnvironment } from '../common/env';

export type ErrorBoundaryFallbackRender = (
  error: unknown,
  reset: () => void
) => unknown;

export interface ErrorBoundaryProps extends Props {
  children?: unknown;
  fallback?: unknown | ErrorBoundaryFallbackRender;
  onError?: (error: unknown) => void;
  resetKey?: unknown;
}

type ErrorBoundaryState = NonNullable<ComponentInstance['errorBoundaryState']>;

type ErrorBoundaryVNode = JSXElement & {
  __instance?: ComponentInstance;
};

function getBoundaryMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || 'Unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

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

export function resolveErrorBoundaryFallback(
  fallback: ErrorBoundaryProps['fallback'],
  error: unknown,
  reset: () => void
): unknown {
  if (typeof fallback === 'function') {
    return fallback(error, reset);
  }

  if (fallback !== undefined) {
    return fallback;
  }

  const message = getBoundaryMessage(error);
  const wrapper = document.createElement('div');
  wrapper.setAttribute('role', 'alert');
  wrapper.setAttribute('data-askr-error-boundary', 'true');
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.padding = '1rem';
  wrapper.style.border = '1px solid currentColor';
  wrapper.style.borderRadius = '0.75rem';
  wrapper.style.display = 'grid';
  wrapper.style.gap = '0.75rem';
  wrapper.style.maxWidth = '100%';

  const title = document.createElement('strong');
  title.textContent = 'Something went wrong while rendering this view.';

  const summary = document.createElement('p');
  summary.textContent =
    'The app recovered into a visible fallback so the error is not hidden in the console.';
  summary.style.margin = '0';

  const details = document.createElement('details');
  details.open = isDevelopmentEnvironment();

  const detailsSummary = document.createElement('summary');
  detailsSummary.textContent = 'Error details';

  const pre = document.createElement('pre');
  pre.textContent = message;
  pre.style.margin = '0';
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Try again';
  button.addEventListener('click', () => reset());

  details.append(detailsSummary, pre);
  wrapper.append(title, summary, details, button);
  return wrapper;
}

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
