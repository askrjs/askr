/** End node-owned lifetimes after the reconciler detaches their DOM. */
import { COMPONENT, NATIVE, TEXT } from '../view/children';
import { HOST, DYNAMIC, type RNode } from './tree';
import { releaseProps } from './props';
import { forgetDormantHost } from './node-hydration';

export function release(node: RNode, errors: unknown[]): void {
  const pending: Array<{ node: RNode; finish: boolean }> = [
    { node, finish: false },
  ];
  while (pending.length) {
    const frame = pending.pop()!;
    const current = frame.node;
    if (frame.finish) {
      if (current.kind === HOST) {
        forgetDormantHost(current);
        releaseProps(current, errors);
      }
      if (current.kind === COMPONENT || current.kind === DYNAMIC) {
        current.instance.dispose(errors);
      }
      continue;
    }
    if (current.kind === TEXT || current.kind === NATIVE) continue;
    pending.push({ node: current, finish: true });
    for (let i = current.children.length - 1; i >= 0; i--) {
      pending.push({ node: current.children[i], finish: false });
    }
  }
}
