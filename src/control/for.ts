/**
 * For JSX primitive
 *
 * Creates a keyed child-scope boundary for efficient list rendering.
 */

import {
  __CONTROL_BOUNDARY__,
  markEagerControlPrimitive,
} from '../common/control';
import type { JSXElement } from '../common/jsx';
import type { DOMElement, VNode } from '../common/vnode';
import {
  createFineGrainedEffect,
  type ForEachSource,
  type ForState,
  useForState,
} from '../runtime';
import { type BoundaryChild, normalizeBoundaryChild } from './shared';

type ForBaseProps<T> = {
  each: ForEachSource<T>;
  fallback?: BoundaryChild;
  children: (item: T, index: () => number) => VNode;
};

type KeyedForProps<T, K extends string | number> = ForBaseProps<T> & {
  by: (item: T, index: number) => K;
  byIndex?: never;
};

type IndexedForProps<T> = ForBaseProps<T> & {
  by?: never;
  byIndex: true;
};

export type ForProps<T, K extends string | number = string | number> =
  | KeyedForProps<T, K>
  | IndexedForProps<T>;

function resolveEach<T>(each: ForEachSource<T>): T[] {
  const resolved = typeof each === 'function' ? each() : each;
  if (!Array.isArray(resolved)) {
    throw new Error('For each must resolve to an array.');
  }
  return resolved;
}

function resolveKeyFn<T>(
  props: ForProps<T>
): (item: T, index: number) => string | number {
  if ('by' in props && typeof props.by === 'function') {
    return props.by;
  }
  if ('byIndex' in props && props.byIndex === true) {
    return (_item, index) => index;
  }
  throw new Error(
    '[askr] <For> requires a stable `by` key function. Use `byIndex` only as an explicit positional escape hatch.'
  );
}

function createForBoundary<T>(props: ForProps<T>): DOMElement {
  if ('by' in props && typeof props.by === 'function' && 'byIndex' in props) {
    throw new Error('[askr] <For> accepts either `by` or `byIndex`, not both.');
  }

  const byFn = resolveKeyFn(props);
  const fallback = normalizeBoundaryChild(props.fallback);
  const forState = useForState(props.each, byFn, props.children, fallback);

  const computeItems = () => resolveEach(forState.eachSource);
  if (!forState._sourceEffect) {
    forState._suspendSourceCommit = true;
    forState._sourceEffect = createFineGrainedEffect({
      lane: 'reactive',
      compute: computeItems,
      commit: (items) => {
        forState.currentItems = items;

        if (forState._suspendSourceCommit) {
          return;
        }

        forState._needsSourceReconcile = true;

        if (forState._enqueueBoundaryCommit) {
          forState._enqueueBoundaryCommit();
          return;
        }

        forState.parentInstance?._enqueueRun?.();
      },
    });
    forState._suspendSourceCommit = false;
  } else {
    forState._suspendSourceCommit = true;
    forState._sourceEffect.updateCompute(computeItems);
    forState._suspendSourceCommit = false;
  }

  return {
    type: __CONTROL_BOUNDARY__,
    _controlState: forState as unknown as ForState<unknown>,
    _forState: forState as unknown as ForState<unknown>,
  };
}

function ForPrimitive<T>(props: ForProps<T>): JSXElement {
  return createForBoundary(props) as unknown as JSXElement;
}

export const For = markEagerControlPrimitive(
  ForPrimitive as <T, K extends string | number = string | number>(
    props: ForProps<T, K>
  ) => JSXElement
) as <T, K extends string | number = string | number>(
  props: ForProps<T, K>
) => JSXElement;
