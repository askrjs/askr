import {
  type ErrorBoundaryFallbackValue,
  type ErrorBoundaryProps,
} from '../common/error-boundary';
import { isDevelopmentEnvironment } from '../common/env';
import { logger } from '../common/logger';
import {
  createBoundaryReset,
  reportBoundaryError,
} from '../runtime';
import type { ComponentInstance } from '../runtime';
import { getRendererDOMHost } from './dom-host';
import type { DOMElement } from './types';

export type ErrorBoundaryVNode = DOMElement & {
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

function createDefaultFallbackNode(
  error: unknown,
  reset: () => void
): Node {
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

function resolveErrorBoundaryFallback(
  fallback: ErrorBoundaryProps['fallback'],
  error: unknown,
  reset: () => void
): ErrorBoundaryFallbackValue {
  if (typeof fallback === 'function') {
    return fallback(error, reset);
  }

  return fallback ?? createDefaultFallbackNode(error, reset);
}

export function createErrorBoundaryElement(
  node: ErrorBoundaryVNode,
  props: Record<string, unknown>,
  parentNamespace?: string
): Node {
  const boundaryState = node.__instance?.errorBoundaryState ?? null;
  const reset = node.__instance
    ? createBoundaryReset(node.__instance)
    : () => {};
  const fallback = props.fallback as ErrorBoundaryProps['fallback'];
  const children = props.children as ErrorBoundaryProps['children'];
  const domHost = getRendererDOMHost();

  if (boundaryState?.error != null) {
    const fallbackValue = resolveErrorBoundaryFallback(
      fallback,
      boundaryState.error,
      reset
    );
    if (fallbackValue instanceof Node) {
      return fallbackValue;
    }
    const fallbackDom = domHost.createDOMNode(fallbackValue, parentNamespace);
    return fallbackDom ?? document.createComment('');
  }

  try {
    const dom = domHost.createDOMNode(children, parentNamespace);
    return dom ?? document.createComment('');
  } catch (error) {
    if (node.__instance) {
      reportBoundaryError(
        node.__instance,
        error,
        props.onError as ((next: unknown) => void) | undefined
      );
    } else {
      logger.error('[Askr] ErrorBoundary caught render error:', error);
    }

    const fallbackValue = resolveErrorBoundaryFallback(fallback, error, reset);
    if (fallbackValue instanceof Node) {
      return fallbackValue;
    }
    const fallbackDom = domHost.createDOMNode(fallbackValue, parentNamespace);
    return fallbackDom ?? document.createComment('');
  }
}
