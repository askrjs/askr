import { bindComponentHost, writeHostOwners } from '../ownership/nodes';
import {
  captureOwnerRange,
  clearRangeOwner,
  createDetachedRange,
  getOwnedRange,
  type DOMRange,
} from '../ownership/ranges';
import { logger } from '../../common/logger';
import {
  getRuntimeEvaluation,
  getRuntimeCleanup,
  enterDomCommitScope,
  endComponentScope,
  getExecutionContextFrame,
  withContext,
  type ComponentInstance,
} from '../../runtime';
import { registerCommitRollback } from '../../runtime/transactions/access';
import { runRetainedElementUpdate } from '../ownership/retained-element';
import { cleanupDetachedComponentHost } from './host-cleanup';
import { beginComponentHostReplacement } from './host-replacement';
import type { InstanceHostNode } from '../dom-host';

type Evaluation = ReturnType<typeof getRuntimeEvaluation>;

/**
 * Materialize a result an extension host declined to commit as a range
 * replacement. One element or comment is the host; text and several nodes take
 * an anchored range, exactly where the server writes them, never a wrapper.
 */
function materializeDeclinedResult(
  instance: ComponentInstance,
  result: unknown,
  ownerDocument: Document,
  renderer: Evaluation
): Node {
  if (result === null || result === undefined) {
    return ownerDocument.createComment('');
  }
  const temporary = ownerDocument.createElement('div');
  renderer.evaluate(result, temporary);
  const onlyChild =
    temporary.childNodes.length === 1 ? temporary.firstChild : null;
  if (onlyChild instanceof Element || onlyChild instanceof Comment) {
    temporary.removeChild(onlyChild);
    return onlyChild;
  }
  const children = ownerDocument.createDocumentFragment();
  while (temporary.firstChild) children.appendChild(temporary.firstChild);
  return createDetachedRange(children, instance, true).fragment!;
}

function recordDeclinedHostOwner(
  host: Node,
  instance: ComponentInstance
): void {
  const indexed = host as Node & { __ASKR_INSTANCES?: ComponentInstance[] };
  const instances = indexed.__ASKR_INSTANCES ?? [];
  if (!instances.includes(instance)) instances.push(instance);
  writeHostOwners(indexed, instances, instances[0] ?? instance);
}

/** DOM application only. Runtime publication and lifecycle settlement belong
 * to the enclosing transaction, regardless of the selected DOM strategy. */
export function applyComponentResult(
  instance: ComponentInstance,
  result: unknown,
  strategy: 'ordinary' | 'keyed-reorder'
): boolean {
  const target = instance.target;
  const placeholder = instance._placeholder;
  if (!target && !placeholder) return false;
  const renderer = getRuntimeEvaluation();
  const previousScope = enterDomCommitScope(instance);
  const executionFrame = getExecutionContextFrame(instance.ownerFrame);
  if (!instance._rootComponentFn) {
    const restoreRange = captureOwnerRange(instance);
    registerCommitRollback(() => {
      bindComponentHost(instance, target, placeholder);
      restoreRange();
    });
  }
  try {
    return withContext(executionFrame, () => {
      if (target) {
        runRetainedElementUpdate(
          target,
          getRuntimeCleanup().cleanupInstancesUnder,
          () => {
            if (strategy === 'keyed-reorder') {
              // Preserve the extension-host callback contract on this strategy.
              renderer.evaluate(result, target);
            } else if (
              !renderer.replaceComponentRange(instance, result, target)
            ) {
              renderer.evaluate(result, target, undefined, instance);
            }
          }
        );
        return true;
      }
      const replacement = renderer.replaceComponentRange(
        instance,
        result,
        placeholder!
      );
      if (replacement) {
        bindComponentHost(
          instance,
          replacement instanceof Element ? replacement : null,
          replacement instanceof Comment ? replacement : undefined
        );
        return true;
      }
      const ownedRange = getOwnedRange(instance);
      if (
        ownedRange &&
        !ownedRange.single &&
        ownedRange.start === placeholder &&
        placeholder!.parentNode
      ) {
        // An earlier declined commit anchored this component's result, so the
        // whole range, not only its start anchor, is replaced or cleared.
        const nextHost = beginComponentHostReplacement(
          placeholder as InstanceHostNode,
          instance,
          null
        ).replace(
          () =>
            materializeDeclinedResult(
              instance,
              result,
              placeholder!.ownerDocument,
              renderer
            ),
          (host) => recordDeclinedHostOwner(host, instance)
        );
        bindComponentHost(
          instance,
          nextHost instanceof Element ? nextHost : null,
          nextHost instanceof Comment ? nextHost : undefined
        );
        return true;
      }
      if (result === null || result === undefined) return true;
      const parent = placeholder!.parentNode;
      if (!parent) {
        logger.warn(
          '[Askr] placeholder no longer in DOM, cannot render component'
        );
        return false;
      }
      const inserted = materializeDeclinedResult(
        instance,
        result,
        placeholder!.ownerDocument,
        renderer
      );
      const nodes =
        inserted instanceof DocumentFragment
          ? Array.from(inserted.childNodes)
          : [inserted];
      const host = nodes[0] as Element | Comment;
      const range: DOMRange | undefined =
        inserted instanceof DocumentFragment
          ? getOwnedRange(instance)
          : undefined;
      registerCommitRollback(() => {
        const indexed = host as InstanceHostNode;
        const provisional = indexed.__ASKR_INSTANCES?.filter(
          (owner) => owner !== instance
        );
        writeHostOwners(
          indexed,
          provisional,
          indexed.__ASKR_INSTANCE === instance
            ? provisional?.[0]
            : indexed.__ASKR_INSTANCE
        );
        const errors: unknown[] = [];
        for (const node of nodes) {
          try {
            getRuntimeCleanup().cleanupInstancesUnder(node);
          } catch (error) {
            errors.push(error);
          }
          try {
            cleanupDetachedComponentHost(node as InstanceHostNode, instance);
          } catch (error) {
            errors.push(error);
          }
        }
        try {
          if (host.parentNode === parent)
            parent.insertBefore(placeholder!, host);
          for (const node of nodes)
            if (node.parentNode === parent) parent.removeChild(node);
        } catch (error) {
          errors.push(error);
        }
        if (range) clearRangeOwner(range, instance);
        if (errors.length)
          throw new AggregateError(errors, 'Placeholder restoration failed');
      });
      parent.replaceChild(inserted, placeholder!);
      bindComponentHost(
        instance,
        host instanceof Element ? host : null,
        host instanceof Comment ? host : undefined
      );
      recordDeclinedHostOwner(host, instance);
      return true;
    });
  } finally {
    endComponentScope(previousScope);
  }
}
