/**
 * For component primitive
 *
 * Creates a reactivity boundary for list iteration, preventing
 * parent re-execution when individual items update.
 */

import { state, type State } from './runtime/state';
import type { VNode } from './common/vnode';
import { __FOR_BOUNDARY__ } from './common/vnode';
import { createForState, type ForState } from './runtime/for';

export interface ForOptions<T> {
  by?: (item: T, index: number) => string | number;
  fallback?: VNode;
}

/**
 * For primitive - creates a reactivity boundary for efficient list rendering.
 *
 * Instead of re-executing all rows when one changes, For creates isolated
 * component instances for each item, re-executing only items that changed.
 */
export function For<T>(
  source: State<T[]> | (() => T[]),
  render: (item: T, index: () => number) => VNode,
  options?: ForOptions<T>
): VNode {
  // Persist ForState across renders using the state() hook so that For can
  // be used inline within component render functions without creating an
  // extra wrapper host element (which would break markup/styling).
  const forStateContainer = state<ForState<T>>(
    createForState(source, render, options?.by)
  );

  const forState = forStateContainer();

  // Return a raw For boundary vnode (renderer will look for _forState)
  const vnode: VNode = {
    type: __FOR_BOUNDARY__,
    props: { source },
    // _forState is stored as unknown to avoid a problematic variance issue when
    // assigning `ForState<T>` to the internal `_forState` slot typed as
    // `ForState<unknown>` in `DOMElement`.
    _forState: forState as unknown as ForState<unknown>,
  };

  return vnode;
}
