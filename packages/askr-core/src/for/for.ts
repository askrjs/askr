/**
 * For component primitive
 *
 * Creates a reactivity boundary for list iteration, preventing
 * parent re-execution when individual items update.
 */

import { state, type State } from '../runtime/state';
import { type DOMElement, type VNode, __FOR_BOUNDARY__ } from '../common/vnode';
import { createForState, type ForState } from '../runtime/for';

/**
 * For primitive - creates a reactivity boundary for efficient list rendering.
 *
 * Instead of re-executing all rows when one changes, For creates isolated
 * component instances for each item, re-executing only items that changed.
 */
export function For<T>(
  source: State<T[]> | (() => T[]),
  key: (item: T, index: number) => string | number,
  render: (item: T, index: () => number) => VNode
): DOMElement {
  if (typeof source === 'function') {
    // Subscribe the current owner component to dependencies of the source
    // callback so keyed list updates still rerender through component boundaries.
    source();
  }

  // Persist ForState across renders using the state() hook so that For can
  // be used inline within component render functions without creating an
  // extra wrapper host element (which would break markup/styling).
  const forStateContainer = state<ForState<T>>(
    createForState(source, key, render)
  );

  const forState = forStateContainer();

  // Return a raw For boundary vnode (renderer will look for _forState)
  const vnode: DOMElement = {
    type: __FOR_BOUNDARY__,
    props: { source },
    // _forState is stored as unknown to avoid a problematic variance issue when
    // assigning `ForState<T>` to the internal `_forState` slot typed as
    // `ForState<unknown>` in `DOMElement`.
    _forState: forState as unknown as ForState<unknown>,
  };

  return vnode;
}
