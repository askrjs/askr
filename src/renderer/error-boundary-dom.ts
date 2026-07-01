import { logger } from '../dev/logger';
import {
  createBoundaryReset,
  reportBoundaryError,
  resolveErrorBoundaryFallback,
  type ErrorBoundaryProps,
} from '../components/error-boundary';
import type { ComponentInstance } from '../runtime/component-contracts';
import { getRendererDOMHost } from './dom-host';
import type { DOMElement } from './types';

export type ErrorBoundaryVNode = DOMElement & {
  __instance?: ComponentInstance;
};

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
