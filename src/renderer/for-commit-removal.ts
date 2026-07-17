import {
  recordBenchCounter,
  recordBenchEvent,
  recordBenchTiming,
  withBenchMetricScope,
} from '../runtime';
import { teardownNodeSubtree } from './cleanup';

declare const __ASKR_BENCH_BUILD__: boolean;

const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;

export function removeForBoundaryNodes(
  parent: Element,
  removedNodes: Node[],
  options: { teardown?: boolean } = {}
): void {
  const removalStartMs = BENCH_BUILD_ENABLED ? performance.now() : 0;
  const shouldTeardown = options.teardown !== false;
  if (
    removedNodes.length > 0 &&
    removedNodes.length === parent.childNodes.length
  ) {
    let canBulkClear = true;
    for (let i = 0; i < removedNodes.length; i++) {
      if (removedNodes[i] !== parent.childNodes[i]) {
        canBulkClear = false;
        break;
      }
    }

    if (canBulkClear) {
      if (shouldTeardown) {
        for (let i = 0; i < removedNodes.length; i++) {
          if (BENCH_BUILD_ENABLED) {
            recordBenchEvent('domRemove');
          }
          teardownNodeSubtree(removedNodes[i]);
        }
      } else if (BENCH_BUILD_ENABLED) {
        recordBenchEvent('domRemove', removedNodes.length);
      }
      if (BENCH_BUILD_ENABLED) {
        withBenchMetricScope('fullClear', () => {
          recordBenchCounter('bulkClearCommits');
          parent.textContent = '';
        });
      } else {
        parent.textContent = '';
      }
      if (BENCH_BUILD_ENABLED) {
        recordBenchTiming(
          'physicalDomRemoval',
          performance.now() - removalStartMs
        );
      }
      return;
    }
  }

  for (let i = 0; i < removedNodes.length; i++) {
    const node = removedNodes[i];
    if (node.parentNode === parent) {
      if (BENCH_BUILD_ENABLED) {
        recordBenchEvent('domRemove');
      }
      if (shouldTeardown) {
        teardownNodeSubtree(node);
      }
      parent.removeChild(node);
    }
  }
  if (BENCH_BUILD_ENABLED && removedNodes.length > 0) {
    recordBenchTiming('physicalDomRemoval', performance.now() - removalStartMs);
  }
}
