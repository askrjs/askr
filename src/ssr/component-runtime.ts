/**
 * SSR component execution and temporary owner lifecycle.
 */

import type { JSXElement } from '../common/jsx';
import type { Props } from '../common/props';
import type { ComponentFunction } from '../common/component';
import { isPromiseLike } from '../common/promise';
import { Fragment, ELEMENT_TYPE } from '../jsx';
import {
  callWithContext,
  cleanupComponent,
  createComponentInstance,
  DefaultPortal,
  disposeDefaultPortalScope,
  getExecutionContextFrame,
  getCurrentComponentInstance,
  markVNodeTreeWithContextFrame,
  setCurrentComponentInstance,
} from '../runtime';
import type { ContextFrame } from '../runtime';
import { throwSSRDataMissing, type RenderContext } from './context';
import type { SSRComponent, VNode } from './types';

export type Component = SSRComponent;

const __ssrGuardStack: Array<{ random: () => number; now: () => number }> = [];

function pushSSRStrictPurityGuard() {
  /* istanbul ignore if - dev-only guard */
  if (process.env.NODE_ENV === 'production') return;
  __ssrGuardStack.push({
    random: Reflect.get(Math, 'random') as () => number,
    now: Reflect.get(Date, 'now') as () => number,
  });
  Reflect.set(Math, 'random', () => {
    throw new Error(
      'SSR Strict Purity: Math.random is not allowed during synchronous SSR. Use the provided `ssr` context RNG instead.'
    );
  });
  Reflect.set(Date, 'now', () => {
    throw new Error(
      'SSR Strict Purity: Date.now is not allowed during synchronous SSR. Pass timestamps explicitly or use deterministic helpers.'
    );
  });
}

function popSSRStrictPurityGuard() {
  /* istanbul ignore if - dev-only guard */
  if (process.env.NODE_ENV === 'production') return;
  const prev = __ssrGuardStack.pop();
  if (prev) {
    Reflect.set(Math, 'random', prev.random);
    Reflect.set(Date, 'now', prev.now);
  }
}

export function executeComponentSync(
  component: Component,
  props: Record<string, unknown> | undefined,
  ctx: RenderContext,
  ownerFrame: ContextFrame | null = null
): VNode | JSXElement {
  try {
    if (process.env.NODE_ENV !== 'production') {
      pushSSRStrictPurityGuard();
    }
    const prev = getCurrentComponentInstance();
    const temp = createComponentInstance(
      'ssr-temp',
      component as ComponentFunction,
      (props || {}) as Props,
      null
    );
    temp.ssr = true;
    temp.ownerFrame = ownerFrame;
    temp.portalScope = temp;
    ctx.ssrCleanupFns.push(() => {
      let cleanupError: unknown = null;

      try {
        cleanupComponent(temp);
      } catch (error) {
        cleanupError = error;
      }

      try {
        disposeDefaultPortalScope(temp);
      } catch (error) {
        if (cleanupError) {
          throw new AggregateError(
            [cleanupError, error],
            'SSR temporary owner cleanup failed'
          );
        }
        throw error;
      }

      if (cleanupError) {
        throw cleanupError;
      }
    });
    setCurrentComponentInstance(temp);
    try {
      const executionFrame = getExecutionContextFrame(ownerFrame);
      const result = callWithContext(
        executionFrame,
        component,
        (props || {}) as Props,
        {
          ssr: ctx,
        }
      );
      if (isPromiseLike(result)) {
        throwSSRDataMissing();
      }
      if (
        typeof result === 'string' ||
        typeof result === 'number' ||
        typeof result === 'boolean' ||
        result === null ||
        result === undefined
      ) {
        const inner =
          result === null || result === undefined || result === false
            ? ''
            : String(result);
        return {
          $$typeof: ELEMENT_TYPE,
          type: Fragment,
          props: { children: inner ? [inner] : [] },
        } as unknown as VNode | JSXElement;
      }
      return markVNodeTreeWithContextFrame(result, ownerFrame) as
        | VNode
        | JSXElement;
    } finally {
      setCurrentComponentInstance(prev);
    }
  } finally {
    if (process.env.NODE_ENV !== 'production') popSSRStrictPurityGuard();
  }
}

export function disposeSSRTemporaryOwners(ctx: RenderContext): void {
  const cleanupFns = ctx.ssrCleanupFns;
  ctx.ssrCleanupFns = [];
  const cleanupErrors: unknown[] = [];

  for (let index = cleanupFns.length - 1; index >= 0; index -= 1) {
    try {
      cleanupFns[index]();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (cleanupErrors.length === 1) {
    throw cleanupErrors[0];
  }

  if (cleanupErrors.length > 1) {
    throw new AggregateError(
      cleanupErrors,
      'SSR temporary owner cleanup failed'
    );
  }
}

export function wrapWithDefaultPortal(out: unknown): VNode | JSXElement {
  if (isPromiseLike(out)) {
    throwSSRDataMissing();
  }

  const portalVNode = {
    $$typeof: ELEMENT_TYPE,
    type: DefaultPortal,
    props: { __askrAutoDefaultPortal: true },
    key: '__default_portal',
  } as unknown;

  if (out == null) {
    return {
      $$typeof: ELEMENT_TYPE,
      type: Fragment,
      props: { children: [portalVNode] },
    } as unknown as VNode | JSXElement;
  }

  return {
    $$typeof: ELEMENT_TYPE,
    type: Fragment,
    props: { children: [out as unknown, portalVNode] },
  } as unknown as VNode | JSXElement;
}

export function renderSyncComponentRoot(
  component: Component,
  props: Record<string, unknown> | undefined,
  ctx: RenderContext
): VNode | JSXElement {
  const wrapped: Component = (
    p?: Record<string, unknown>,
    c?: { signal?: AbortSignal; ssr?: RenderContext }
  ) => wrapWithDefaultPortal(component(p ?? {}, c));

  return executeComponentSync(wrapped, props || {}, ctx);
}
