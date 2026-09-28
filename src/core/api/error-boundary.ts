/**
 * ErrorBoundary: catches render failures in its subtree (and lifecycle
 * failures delivered to it) and renders a fallback until reset.
 */

import type {
  ErrorBoundaryFallbackRender,
  ErrorBoundaryProps,
} from '../../common/error-boundary';
import { logger } from '../../common/logger';
import { ELEMENT_TYPE, Fragment, STATIC_CHILDREN } from '../../common/jsx';
import { isDevelopmentEnvironment } from '../../common/env';
import { requireInstance, type ComponentInstance } from '../component/instance';
import { recordUndo } from '../component/journal';
import type { Owner } from '../reactive/owner';
import { NATIVE_TYPE } from '../view/children';
import { hookSlot, onCommit } from './hooks';

export type { ErrorBoundaryFallbackRender, ErrorBoundaryProps };

interface BoundarySlot {
  caught: boolean;
  error: unknown;
  resetKey: unknown;
}

const boundarySlots = new WeakMap<Owner, BoundarySlot>();
const recoveryHolds = new WeakMap<Owner, Set<() => void>>();

/** The nearest ErrorBoundary above `owner`, or null. */
export function nearestErrorBoundary(
  owner: Owner | null
): ComponentInstance | null {
  for (let current = owner?.parent ?? null; current; current = current.parent) {
    if (boundarySlots.has(current)) return current as ComponentInstance;
  }
  return null;
}

/**
 * While `boundary` shows its fallback, defer `release` until the boundary
 * commits a recovery or ends. Returns false (and does not call `release`)
 * when the boundary is not showing a fallback.
 */
export function holdUntilBoundaryRecovers(
  boundary: ComponentInstance,
  release: () => void
): boolean {
  if (boundary.disposed || !boundarySlots.get(boundary)?.caught) return false;
  let holds = recoveryHolds.get(boundary);
  if (!holds) {
    holds = new Set();
    recoveryHolds.set(boundary, holds);
    boundary.onCleanup(() => releaseHolds(boundary));
  }
  holds.add(release);
  return true;
}

function releaseHolds(boundary: Owner): void {
  const holds = recoveryHolds.get(boundary);
  if (!holds) return;
  recoveryHolds.delete(boundary);
  for (const release of holds) release();
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

function element(
  type: string | symbol,
  props: Record<string, unknown>
): unknown {
  // The fallback's child lists are fixed, like static JSX children.
  if (Array.isArray(props.children)) {
    Object.defineProperty(props.children, STATIC_CHILDREN, { value: true });
  }
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

  const previousBoundary = instance.boundary;
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
  recordUndo(() => {
    instance.boundary = previousBoundary;
  });

  boundarySlots.set(instance, slot);

  if (!slot.caught) {
    if (recoveryHolds.has(instance)) {
      onCommit(instance, () => releaseHolds(instance));
    }
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
  const output =
    typeof fallback === 'function'
      ? (fallback as ErrorBoundaryFallbackRender)(slot.error, reset)
      : (fallback ?? defaultFallback(slot.error, reset));
  return typeof Node !== 'undefined' && output instanceof Node
    ? element(NATIVE_TYPE, { node: output })
    : output;
}
