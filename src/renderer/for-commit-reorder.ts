import { recordBenchCounter, recordBenchEvent } from '../runtime';
import { canUseDirectReplaceChildrenSpread } from './utils';

const DENSE_MOVE_MINIMUM = 64;
const DENSE_MOVE_RATIO = 0.75;

export function replaceChildrenInOrder(
  parent: Element,
  nodes: Node[],
  allowDirectSpread: boolean
): void {
  if (allowDirectSpread && canUseDirectReplaceChildrenSpread(nodes.length)) {
    parent.replaceChildren(...nodes);
    return;
  }

  const fragment = parent.ownerDocument.createDocumentFragment();
  for (let i = 0; i < nodes.length; i++) {
    fragment.appendChild(nodes[i]);
  }
  parent.replaceChildren(fragment);
}

function getLISIndices(sequence: number[]): number[] {
  if (sequence.length === 0) {
    return [];
  }

  const predecessors = sequence.slice();
  const lisIndices: number[] = [0];

  for (let i = 1; i < sequence.length; i += 1) {
    const current = sequence[i];
    const lastLisIndex = lisIndices[lisIndices.length - 1];

    if (sequence[lastLisIndex] < current) {
      predecessors[i] = lastLisIndex;
      lisIndices.push(i);
      continue;
    }

    let lo = 0;
    let hi = lisIndices.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sequence[lisIndices[mid]] < current) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (current < sequence[lisIndices[lo]]) {
      if (lo > 0) {
        predecessors[i] = lisIndices[lo - 1];
      }
      lisIndices[lo] = i;
    }
  }

  let cursor = lisIndices.length - 1;
  let index = lisIndices[cursor];
  while (cursor >= 0) {
    lisIndices[cursor] = index;
    index = predecessors[index];
    cursor -= 1;
  }

  return lisIndices;
}

export function commitMoveOnlyReorder(parent: Element, nodes: Node[]): boolean {
  const currentNodes = Array.from(parent.childNodes);
  if (currentNodes.length !== nodes.length) {
    return false;
  }

  const currentIndexByNode = new Map<Node, number>();
  for (let i = 0; i < currentNodes.length; i += 1) {
    currentIndexByNode.set(currentNodes[i], i);
  }

  const positions = Array.from({ length: nodes.length }, () => 0);
  for (let i = 0; i < nodes.length; i += 1) {
    const position = currentIndexByNode.get(nodes[i]);
    if (position === undefined) {
      return false;
    }
    positions[i] = position;
  }

  const lisIndices = getLISIndices(positions);
  if (lisIndices.length === nodes.length) {
    return true;
  }

  const moveCount = nodes.length - lisIndices.length;
  const denseMoveThreshold = Math.max(
    DENSE_MOVE_MINIMUM,
    Math.floor(nodes.length * DENSE_MOVE_RATIO)
  );

  if (moveCount >= denseMoveThreshold) {
    recordBenchEvent('domMove', moveCount);
    recordBenchCounter('replaceChildrenCommits');
    replaceChildrenInOrder(parent, nodes, false);
    return true;
  }

  let lisCursor = lisIndices.length - 1;
  let anchor: Node | null = null;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (lisCursor >= 0 && i === lisIndices[lisCursor]) {
      anchor = node;
      lisCursor -= 1;
      continue;
    }

    if (node.nextSibling !== anchor) {
      recordBenchEvent('domMove');
      parent.insertBefore(node, anchor);
    }

    anchor = node;
  }

  return true;
}
