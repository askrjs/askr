import { bindComponentHost, writeHostOwners } from './dom-ownership';
import { captureOwnerRange } from './dom-range';
import { logger } from '../common/logger';
import {
  getRuntimeRenderer,
  enterDomCommitScope,
  restoreDomCommitScope,
  getExecutionContextFrame,
  withContext,
  type ComponentInstance,
} from '../runtime';
import { registerCommitRollback } from '../runtime/transaction-access';
import { runRetainedElementUpdate } from './retained-element-rollback';

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
  const renderer = getRuntimeRenderer();
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
        runRetainedElementUpdate(target, renderer.cleanupInstancesUnder, () => {
          if (strategy === 'keyed-reorder') {
            // Preserve the extension-host callback contract on this strategy.
            renderer.evaluate(result, target);
          } else if (
            !renderer.replaceComponentRange(instance, result, target)
          ) {
            renderer.evaluate(result, target, undefined, instance);
          }
        });
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
      if (result === null || result === undefined) return true;
      const parent = placeholder!.parentNode;
      if (!parent) {
        logger.warn(
          '[Askr] placeholder no longer in DOM, cannot render component'
        );
        return false;
      }
      const temporary = placeholder!.ownerDocument.createElement('div');
      renderer.evaluate(result, temporary);
      const onlyChild =
        temporary.childNodes.length === 1 ? temporary.firstChild : null;
      const host =
        onlyChild instanceof Element || onlyChild instanceof Comment
          ? onlyChild
          : temporary;
      if (host === temporary)
        (
          temporary as Element & { __ASKR_WRAPPER_HOST?: boolean }
        ).__ASKR_WRAPPER_HOST = true;
      registerCommitRollback(() => {
        renderer.cleanupInstancesUnder(host);
        if (host.parentNode === parent) parent.replaceChild(placeholder!, host);
      });
      parent.replaceChild(host, placeholder!);
      bindComponentHost(
        instance,
        host instanceof Element ? host : null,
        host instanceof Comment ? host : undefined
      );
      const indexed = host as Node & { __ASKR_INSTANCES?: ComponentInstance[] };
      const instances = indexed.__ASKR_INSTANCES ?? [];
      if (!instances.includes(instance)) instances.push(instance);
      writeHostOwners(indexed, instances, instances[0] ?? instance);
      return true;
    });
  } finally {
    restoreDomCommitScope(previousScope);
  }
}
