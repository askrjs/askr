/**
 * ErrorBoundary: catches render failures in its subtree (and lifecycle
 * failures delivered to it) and renders a fallback until reset.
 */

import type {
  ErrorBoundaryFallbackRender,
  ErrorBoundaryProps,
} from '../../common/error-boundary';
import { logger } from '../../common/logger';
import { ELEMENT_TYPE, Fragment } from '../../common/jsx';
import { isDevelopmentEnvironment } from '../../common/env';
import { requireInstance } from '../component/instance';
import { hookSlot } from './hooks';

export type { ErrorBoundaryFallbackRender, ErrorBoundaryProps };

interface BoundarySlot {
  caught: boolean;
  error: unknown;
  resetKey: unknown;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function element(type: string, props: Record<string, unknown>): unknown {
  return { $$typeof: ELEMENT_TYPE, type, props, key: null };
}

function defaultFallback(error: unknown, reset: () => void): unknown {
  return element('div', {
    role: 'alert',
    'data-askr-error-boundary': 'true',
    style: {
      boxSizing: 'border-box',
      padding: '1rem',
      border: '1px solid currentColor',
      borderRadius: '0.75rem',
      display: 'grid',
      gap: '0.75rem',
      maxWidth: '100%',
    },
    children: [
      element('strong', {
        children: 'Something went wrong while rendering this view.',
      }),
      element('p', {
        style: { margin: '0' },
        children:
          'The app recovered into a visible fallback so the error is not hidden in the console.',
      }),
      element('details', {
        open: isDevelopmentEnvironment(),
        children: [
          element('summary', { children: 'Error details' }),
          element('pre', {
            style: {
              margin: '0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            },
            children: errorMessage(error),
          }),
        ],
      }),
      element('button', {
        type: 'button',
        onClick: reset,
        children: 'Try again',
      }),
    ],
  });
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

  if (!slot.caught) {
    return {
      $$typeof: ELEMENT_TYPE,
      type: Fragment,
      props: { children: props.children },
      key: null,
    };
  }

  const reset = () => {
    if (!slot.caught) return;
    slot.caught = false;
    slot.error = undefined;
    instance.computation.invalidate();
  };
  const fallback = props.fallback;
  return typeof fallback === 'function'
    ? (fallback as ErrorBoundaryFallbackRender)(slot.error, reset)
    : (fallback ?? defaultFallback(slot.error, reset));
}
