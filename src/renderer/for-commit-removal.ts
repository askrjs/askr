import {
  recordBenchCounter,
  recordBenchEvent,
  withBenchMetricScope,
} from '../runtime';
import { teardownNodeSubtree } from './cleanup';

export function removeForBoundaryNodes(
  parent: Element,
  removedNodes: Node[]
): void {
  if (
    removedNodes.length > 0 &&
    removedNodes.length === parent.childNodes.length
  ) {
    let canBulkClear = true;
    for (let i = 0; i < removedNodes.length; i++) {
      if (removedNodes[i].parentNode !== parent) {
        canBulkClear = false;
        break;
      }
    }

    if (canBulkClear) {
      for (let i = 0; i < removedNodes.length; i++) {
        recordBenchEvent('domRemove');
        teardownNodeSubtree(removedNodes[i]);
      }
      withBenchMetricScope('fullClear', () => {
        recordBenchCounter('bulkClearCommits');
        parent.textContent = '';
      });
      return;
    }
  }

  for (let i = 0; i < removedNodes.length; i++) {
    const node = removedNodes[i];
    if (node.parentNode === parent) {
      recordBenchEvent('domRemove');
      teardownNodeSubtree(node);
      parent.removeChild(node);
    }
  }
}
