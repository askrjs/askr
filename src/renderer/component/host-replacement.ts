import { registerCommitParticipant } from '../../runtime/transactions/access';
import { ownCleanup } from '../../runtime/ownership/record';
import { bindComponentHost } from '../ownership/nodes';
import {
  cleanupComponent,
  type ComponentInstance,
  registerCommitRollback,
} from '../../runtime';
import { cleanupDetachedComponentHost } from './host-cleanup';
import type { InstanceHostNode } from '../dom-host';
import { restoreVNodeComponentInstance } from './host-instances';
import {
  getOwnedRange,
  getRangeNodes,
  clearRangeOwner,
  createSingleNodeRange,
  registerRange,
  removeRange,
  type DOMRange,
} from '../ownership/ranges';

export interface ComponentHostReplacement {
  replace(
    materialize: () => Node,
    prepareNextDom: (nextDom: Node) => void
  ): Node;
}

export function cleanupProvisionalComponentInstance(
  instance: ComponentInstance
): void {
  try {
    cleanupComponent(instance);
  } catch {
    // A rollback cleanup error must not replace the creation failure.
  }
}

export function cleanupProvisionalComponentInstances(
  instances: ComponentInstance[]
): void {
  for (let index = instances.length - 1; index >= 0; index -= 1) {
    cleanupProvisionalComponentInstance(instances[index]!);
  }
}

export function createRetainedHostInstanceSet(
  owner: ComponentInstance,
  additional?: Iterable<ComponentInstance>
): Set<ComponentInstance> {
  const retained = new Set<ComponentInstance>([owner]);
  for (const instance of additional ?? []) retained.add(instance);
  return retained;
}

function cleanupReplacementNode(
  node: Node,
  retainedInstances: Iterable<ComponentInstance>
): void {
  cleanupDetachedComponentHost(node as InstanceHostNode, retainedInstances);
}

interface HostBinding {
  target: Element | null;
  placeholder: Comment | undefined;
}

export function beginComponentHostReplacement(
  existingHost: InstanceHostNode,
  retainedInstance: ComponentInstance,
  previousTarget: Element | null,
  retainedInstances: Iterable<ComponentInstance> = [retainedInstance],
  disposeOnRollback = false
): ComponentHostReplacement {
  return new HostReplacement(
    existingHost,
    retainedInstance,
    previousTarget,
    retainedInstances,
    disposeOnRollback
  );
}

/** One replacement record owns preparation, publication, retirement, and restoration. */
class HostReplacement implements ComponentHostReplacement {
  private readonly parent: ParentNode | null;
  private readonly previousRange: DOMRange | undefined;
  private readonly previousNodes: Node[];
  private readonly previousNextSibling: ChildNode | null;
  private nextHost: Node | null = null;
  private nextRange: DOMRange | undefined;
  private previousBindings: Map<ComponentInstance, HostBinding> | undefined;
  private didReplace = false;
  private replacementAttempted = false;
  private finished = false;
  private publishedRetainedInstances: ComponentInstance[] | undefined;

  constructor(
    private readonly existingHost: InstanceHostNode,
    private readonly retainedInstance: ComponentInstance,
    private readonly previousTarget: Element | null,
    private readonly retainedInstances: Iterable<ComponentInstance>,
    private readonly disposeOnRollback: boolean
  ) {
    this.parent = existingHost.parentNode;
    this.previousRange = getOwnedRange(retainedInstance);
    this.previousNodes =
      this.previousRange && !this.previousRange.single
        ? [
            this.previousRange.start,
            ...getRangeNodes(this.previousRange),
            this.previousRange.end,
          ]
        : [existingHost];
    this.previousNextSibling =
      this.previousNodes[this.previousNodes.length - 1]!.nextSibling;
    if (!registerCommitParticipant(this))
      throw new Error(
        '[askr] Component replacement requires a commit operation.'
      );
  }

  publish(): void {
    if (this.finished) return;
    if (this.replacementAttempted && this.didReplace) {
      this.publishedRetainedInstances = Array.from(this.retainedInstances);
      if (this.nextHost) {
        for (const [instance, binding] of this.previousBindings ?? []) {
          if (
            binding.target !== this.existingHost &&
            binding.placeholder !== this.existingHost
          ) {
            continue;
          }
          if (this.nextHost instanceof Element) {
            bindComponentHost(instance, this.nextHost);
          } else if (this.nextHost instanceof Comment) {
            bindComponentHost(instance, null, this.nextHost);
          }
        }
      }
    }
  }

  settle(): void {
    if (this.finished) return;
    this.finished = true;
    if (!this.replacementAttempted || !this.didReplace) return;
    const retained = this.publishedRetainedInstances!;
    const errors: unknown[] = [];
    if (this.previousRange) clearRangeOwner(this.previousRange);
    for (const node of this.previousNodes) {
      try {
        cleanupDetachedComponentHost(node as InstanceHostNode, retained);
      } catch (error) {
        errors.push(error);
      }
    }
    if (this.nextRange) registerRange(this.nextRange, this.retainedInstance);
    if (errors.length)
      throw new AggregateError(
        errors,
        'Component replacement retirement failed'
      );
  }

  rollback(): void {
    if (this.finished) return;
    this.finished = true;
    if (!this.replacementAttempted) return;

    const rollbackErrors: unknown[] = [];
    const retained = Array.from(this.retainedInstances);
    if (this.nextHost && this.nextHost !== this.existingHost) {
      try {
        if (this.nextRange && !this.nextRange.single) {
          removeRange(this.nextRange, (node) => {
            cleanupReplacementNode(node, retained);
            node.parentNode?.removeChild(node);
          });
        } else {
          cleanupReplacementNode(this.nextHost, retained);
          this.nextHost.parentNode?.removeChild(this.nextHost);
        }
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    if (this.parent) {
      try {
        for (const node of this.previousNodes)
          this.parent.insertBefore(
            node,
            this.previousNextSibling?.parentNode === this.parent
              ? this.previousNextSibling
              : null
          );
      } catch (error) {
        rollbackErrors.push(error);
      }
    }
    try {
      if (this.disposeOnRollback) cleanupComponent(this.retainedInstance);
      for (const [instance, binding] of this.previousBindings ?? []) {
        if (this.disposeOnRollback && instance === this.retainedInstance)
          continue;
        bindComponentHost(instance, binding.target, binding.placeholder);
      }
      if (
        !this.previousBindings?.has(this.retainedInstance) &&
        !this.disposeOnRollback
      ) {
        bindComponentHost(
          this.retainedInstance,
          this.previousTarget,
          this.retainedInstance._placeholder
        );
      }
      if (this.previousRange)
        registerRange(this.previousRange, this.retainedInstance);
    } catch (error) {
      rollbackErrors.push(error);
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        rollbackErrors,
        'Component host replacement rollback failed'
      );
    }
  }

  apply(): void {
    if (
      this.replacementAttempted &&
      this.didReplace &&
      this.previousRange &&
      !this.previousRange.single
    ) {
      for (const node of this.previousNodes) node.parentNode?.removeChild(node);
    }
  }

  replace(
    materialize: () => Node,
    prepareNextDom: (replacement: Node) => void
  ): Node {
    this.replacementAttempted = true;

    this.previousBindings = new Map(
      Array.from(this.retainedInstances, (instance) => [
        instance,
        {
          target: instance.target,
          placeholder: instance._placeholder,
        },
      ])
    );
    const nextDom = materialize();
    const registeredRange = getOwnedRange(this.retainedInstance);
    this.nextRange =
      registeredRange && registeredRange !== this.previousRange
        ? registeredRange
        : undefined;
    this.nextHost =
      nextDom instanceof DocumentFragment ? nextDom.firstChild : nextDom;
    if (!this.nextHost) {
      throw new Error('[askr] Component replacement produced no host node.');
    }
    if (!this.nextRange) {
      this.nextRange = createSingleNodeRange(
        this.nextHost,
        this.retainedInstance
      );
    }
    prepareNextDom(this.nextHost);
    if (this.parent && this.nextHost !== this.existingHost) {
      if (this.previousRange && !this.previousRange.single) {
        this.parent.insertBefore(nextDom, this.previousRange.start);
      } else {
        this.parent.replaceChild(nextDom, this.existingHost);
      }
      this.didReplace = true;
    }

    return this.nextHost;
  }
}

export function registerVNodeComponentInstanceRollback(
  node: unknown,
  previousInstance: ComponentInstance | undefined,
  provisionalInstance: ComponentInstance
): void {
  let restored = false;
  const restoreOwnership = (): void => {
    if (restored) return;
    restored = true;
    restoreVNodeComponentInstance(node, previousInstance);
  };

  ownCleanup(provisionalInstance.owner, restoreOwnership);
  registerCommitRollback(() => {
    restoreOwnership();
    cleanupProvisionalComponentInstance(provisionalInstance);
  });
}
