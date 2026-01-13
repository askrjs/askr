/**
 * For component primitive
 * 
 * Creates a reactivity boundary for list iteration, preventing
 * parent re-execution when individual items update.
 */

import { state, type State } from './runtime/state';
import type { VNode } from './common/vnode';
import { __FOR_BOUNDARY__ } from './common/vnode';
import { createForState, evaluateForState, type ForState } from './runtime/for';

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
  // Create a component that manages the ForState
  const ForComponent = () => {
    // Persist ForState across renders - created on first render
    const forStateContainer = state<ForState<T>>(
      createForState(source, render, options?.by)
    );
    
    const forState = forStateContainer();
    
    // Evaluate the current array and return vnodes
    const children = evaluateForState(forState, source);
    
    return {
      type: 'for-boundary',
      children,
    };
  };
  
  // Return a component vnode
  return {
    type: ForComponent,
    props: {},
  } as VNode;
}
