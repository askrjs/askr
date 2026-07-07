import {
  __CONTROL_BOUNDARY__,
  markEagerControlPrimitive,
} from '../common/control';
import type { JSXElement } from '../common/jsx';
import type { VNode } from '../common/vnode';
import { createShowState, type ShowState } from '../runtime';
import { state } from '../runtime';
import {
  type BoundaryChild,
  normalizeBoundaryChild,
  resolveMaybeAccessor,
} from './shared';

type ShowSource<T> = T | (() => T);
type Truthy<T> = T extends false | '' | 0 | 0n | null | undefined ? never : T;

export type ShowProps<T> = {
  when: ShowSource<T>;
  fallback?: BoundaryChild;
  children: BoundaryChild | ((value: Truthy<T>) => BoundaryChild);
};

function createTruthyRenderer<T>(
  props: ShowProps<T>
): ShowState['renderTruthy'] {
  if (typeof props.children === 'function') {
    return (value: unknown) =>
      normalizeBoundaryChild(
        (props.children as (resolved: Truthy<T>) => VNode)(value as Truthy<T>)
      ) as VNode;
  }

  const staticChild = normalizeBoundaryChild(props.children);
  return () => staticChild as VNode;
}

function createFallbackRenderer(
  fallback: BoundaryChild | undefined
): (() => VNode) | null {
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
