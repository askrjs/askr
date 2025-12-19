/**
 * Benchmark renderer utilities
 *
 * Provides common utilities for setting up benchmark scenarios.
 * Handles DOM container management and cleanup.
 */

import {
  createTestContainer,
  trackDOMMutations,
} from '../../tests/helpers/test_renderer';
import type { VNode } from '../../src/renderer/dom';

export interface BenchContainer {
  container: Element;
  cleanup: () => void;
}

/**
 * Create a benchmark container with cleanup
 */
export function createBenchContainer(): BenchContainer {
  return createTestContainer();
}

/**
 * Measure DOM operation count for a specific node
 */
export function countDOMOperations(node: Element, fn: () => void): number {
  const { addedNodes, removedNodes, changedAttributes, changedText } =
    trackDOMMutations(node, fn);

  return addedNodes + removedNodes + changedAttributes + changedText;
}

/**
 * Create a deterministic component tree of specified depth and breadth
 */
export function createComponentTree(
  depth: number,
  breadth: number,
  prefix = 'leaf'
): VNode {
  let id = 0;

  function build(d: number): VNode {
    if (d === 0) {
      return { type: 'div', children: [`${prefix}-${id++}`] };
    }

    const children: VNode[] = [];
    for (let i = 0; i < breadth; i++) {
      children.push(build(d - 1));
    }

    return { type: 'div', children };
  }

  return build(depth);
}
