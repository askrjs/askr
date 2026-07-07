/**
 * Shared SSR boundary state and renderable child helpers.
 */

import type { JSXElement } from '../common/jsx';
import { __CONTROL_BOUNDARY__ } from '../common/control';
import type { DOMElement } from '../common/vnode';
import { ELEMENT_TYPE } from '../jsx';
import type { ComponentInstance } from '../runtime';
import {
  type ControlBoundaryState,
  evaluateCaseState,
  evaluateShowState,
} from '../runtime';
import { evaluateForState } from '../runtime';
import type { VNode } from './types';

type ErrorBoundaryState = NonNullable<ComponentInstance['errorBoundaryState']>;

export function normalizeRenderableChildren(value: unknown): unknown[] {
  if (value === null || value === undefined || value === false) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function getRenderableChildren(
  node: VNode | JSXElement
): unknown[] | undefined {
  if (Array.isArray((node as VNode).children)) {
    return (node as VNode).children;
  }
  if (Array.isArray(node.props?.children)) {
    return node.props.children as unknown[];
  }
  if (
    node.props?.children !== undefined &&
    node.props.children !== null &&
    node.props.children !== false
  ) {
    return [node.props.children];
  }
  return undefined;
}

export function getErrorBoundaryState(
  node: VNode | JSXElement
): ErrorBoundaryState | null {
  return (
    (node as DOMElement & { __instance?: ComponentInstance }).__instance
      ?.errorBoundaryState ?? null
  );
}

export function resetErrorBoundaryState(node: VNode | JSXElement): void {
  const instance = (node as DOMElement & { __instance?: ComponentInstance })
    .__instance;
  const state = instance?.errorBoundaryState;
  if (state) {
    state.error = null;
    state.notified = false;
  }
}

export function createErrorBoundaryReset(node: VNode | JSXElement): () => void {
  return () => resetErrorBoundaryState(node);
}

function createDefaultErrorBoundaryFallbackVNode(error: unknown): JSXElement {
  const message =
    error instanceof Error
      ? error.stack || error.message || error.name
      : typeof error === 'string'
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();

  return {
    $$typeof: ELEMENT_TYPE,
    type: 'div',
    props: {
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
        {
          $$typeof: ELEMENT_TYPE,
          type: 'strong',
          props: {
            children: ['Something went wrong while rendering this view.'],
          },
        },
        {
          $$typeof: ELEMENT_TYPE,
          type: 'p',
          props: {
            style: { margin: '0' },
            children: [
              'The app recovered into a visible fallback so the error is not hidden in the console.',
            ],
          },
        },
        {
          $$typeof: ELEMENT_TYPE,
          type: 'details',
          props: {
            open: process.env.NODE_ENV !== 'production',
            children: [
              {
                $$typeof: ELEMENT_TYPE,
                type: 'summary',
                props: {
                  children: ['Error details'],
                },
              },
              {
                $$typeof: ELEMENT_TYPE,
                type: 'pre',
                props: {
                  style: {
                    margin: '0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  },
                  children: [message],
                },
              },
            ],
          },
        },
      ],
    },
    key: null,
  } as JSXElement;
}

export function resolveErrorBoundaryFallbackNode(
  fallback: unknown,
  error: unknown,
  reset: () => void
): unknown {
  return typeof fallback === 'function'
    ? (fallback as (error: unknown, reset: () => void) => unknown)(error, reset)
    : fallback !== undefined
      ? fallback
      : createDefaultErrorBoundaryFallbackVNode(error);
}

export function getControlBoundaryState(
  node: VNode | JSXElement
): ControlBoundaryState | null {
  const boundaryNode = node as DOMElement;

  return (
    boundaryNode._controlState ??
    (boundaryNode._forState as ControlBoundaryState | undefined) ??
    null
  );
}

export function evaluateControlBoundaryChildren(
  node: VNode | JSXElement
): unknown[] | undefined {
  if (node.type !== __CONTROL_BOUNDARY__) {
    return undefined;
  }

  const controlState = getControlBoundaryState(node);
  if (!controlState) {
    return [];
  }

  if (controlState.kind === 'for') {
    return evaluateForState(controlState);
  }
  if (controlState.kind === 'show') {
    return evaluateShowState(controlState);
  }
  return evaluateCaseState(controlState);
}
