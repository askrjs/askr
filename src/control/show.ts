import {
  __CONTROL_BOUNDARY__,
  markEagerControlPrimitive,
} from '../common/control';
import type { JSXElement } from '../common/jsx';
import type { VNode } from '../common/vnode';
import { createShowState, type ShowState } from '../runtime/control';
import { state } from '../runtime/state';
import { normalizeBoundaryChild, resolveMaybeAccessor } from './shared';

type ShowSource<T> = T | (() => T);
type ShowBoundaryChild = VNode | readonly VNode[];

export type ShowProps<T> = {
  when: ShowSource<T>;
  fallback?: unknown;
  children: ShowBoundaryChild | ((value: NonNullable<T>) => ShowBoundaryChild);
};

function createTruthyRenderer<T>(
  props: ShowProps<T>
): ShowState['renderTruthy'] {
  if (typeof props.children === 'function') {
    return (value: unknown) =>
      normalizeBoundaryChild(
        (props.children as (resolved: NonNullable<T>) => VNode)(
          value as NonNullable<T>
        )
      ) as VNode;
  }

  const staticChild = normalizeBoundaryChild(props.children);
  return () => staticChild as VNode;
}

function createFallbackRenderer(fallback: unknown): (() => VNode) | null {
  const normalizedFallback = normalizeBoundaryChild(fallback);
  if (normalizedFallback == null || normalizedFallback === false) {
    return null;
  }
  return () => normalizedFallback;
}

function ShowPrimitive<T>(props: ShowProps<T>): JSXElement {
  const selectedValue = resolveMaybeAccessor(props.when);
  const renderTruthy = createTruthyRenderer(props);
  const renderFallback = createFallbackRenderer(props.fallback);

  const showStateContainer = state<ShowState>(
    createShowState(selectedValue, renderTruthy, renderFallback)
  );
  const showState = showStateContainer();

  showState.selectedValue = selectedValue;
  showState.renderTruthy = renderTruthy;
  showState.renderFallback = renderFallback;

  return {
    type: __CONTROL_BOUNDARY__,
    _controlState: showState,
  } as unknown as JSXElement;
}

export const Show = markEagerControlPrimitive(
  ShowPrimitive as <T>(props: ShowProps<T>) => JSXElement
) as <T>(props: ShowProps<T>) => JSXElement;
