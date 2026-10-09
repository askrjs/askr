/** One owner installs and retires host bindings, listeners and refs. */
import { Computation } from '../reactive/graph';
import { deliverToBoundary } from '../component/errors';
import { readValue } from '../reactive/readable';
import { effectScheduler } from '../reactive/scheduler';
import { throwCollected } from '../reactive/owner';
import { setRef } from './refs';
import {
  parseEventProp,
  removeAllListeners,
  removeListener,
  setListener,
} from './events';
import { captureDomPropertyUndo, hasDomPropertyWrite } from './dom-properties';
import { getRenderedAttributeName } from './element-attributes';
import { applyScalarPropValue } from './prop-values';
import { CommitMutationError, type Pass } from './pass';
import type { HostNode } from './tree';
import { reportTeardown } from './teardown';
import {
  isSimpleAttribute,
  isInputValue,
  isBooleanControl,
} from './prop-policy';
import {
  recordAttributeUndo,
  recordInputValueUndo,
  recordBooleanControlUndo,
} from './prop-transaction';
import { enclosingSelect, resyncSelect } from './prop-select';

/** Remove a committed binding provisionally and restore it if the pass aborts. */
export function retireBindingForCommit(
  pass: Pass,
  node: HostNode,
  key: string
): Computation<void> | undefined {
  const binding = node.bindings?.get(key);
  if (!binding) return undefined;
  node.bindings!.delete(key);
  pass.onReversibleCommit(
    () => {
      (node.bindings ??= new Map()).set(key, binding);
    },
    () => reportTeardown(binding.dispose())
  );
  return binding;
}

/** Restore or remove a binding-map entry when a provisional install aborts. */
function recordBindingInstallUndo(
  pass: Pass,
  node: HostNode,
  key: string,
  binding: Computation<void>,
  previous: Computation<void> | undefined
): void {
  pass.onReversibleCommit(() => {
    if (node.bindings?.get(key) !== binding) return;
    if (previous) node.bindings.set(key, previous);
    else {
      node.bindings.delete(key);
      if (node.bindings.size === 0) node.bindings = null;
    }
  });
}

/** The last value each binding applied, for diffing its next write. */
const appliedByBinding = new WeakMap<Computation<void>, unknown>();

export function lastApplied(binding: Computation<void> | undefined): unknown {
  return binding ? appliedByBinding.get(binding) : undefined;
}

export function setHandler(node: HostNode, key: string, value: unknown): void {
  const event = parseEventProp(key)!;
  if (typeof value === 'function') {
    setListener(
      (node.listeners ??= new Map()),
      node.el,
      key,
      event,
      value as EventListener,
      node.owner
    );
  } else if (node.listeners) {
    removeListener(node.listeners, node.el, key);
  }
}

export function setHandlerForCommit(
  pass: Pass,
  node: HostNode,
  key: string,
  value: unknown,
  previous: unknown
): void {
  pass.op(() => {
    pass.onReversibleCommit(() => setHandler(node, key, previous));
    try {
      setHandler(node, key, value);
    } catch (error) {
      throw new CommitMutationError(error);
    }
  });
}

export function bind(
  pass: Pass,
  node: HostNode,
  key: string,
  read: () => unknown,
  previousValue: unknown,
  fresh: boolean
): void {
  const { el, tag } = node;
  let last = previousValue;
  let installing = true;
  let propertyBacked = false;
  const binding: Computation<void> = new Computation<void>(
    node.owner,
    () => {
      try {
        const value = key.startsWith('prop:') ? read() : readValue(read);
        propertyBacked = hasDomPropertyWrite(el, key, value, tag);
        const propertyUndo = propertyBacked
          ? captureDomPropertyUndo(el, key, value, tag)
          : null;
        if (propertyUndo && installing && !fresh) {
          pass.onReversibleCommit(propertyUndo);
        }
        try {
          applyScalarPropValue(el, key, value, tag, last);
        } catch (error) {
          if (propertyUndo && (fresh || !installing)) {
            try {
              propertyUndo();
            } catch (rollbackError) {
              throw new AggregateError(
                [error, rollbackError],
                'Bound DOM property write and rollback failed'
              );
            }
          }
          throw error;
        }
        const changed = !Object.is(last, value);
        last = value;
        // A bound option value changes the select's matching option.
        if (changed && tag === 'option' && key === 'value') {
          const select = enclosingSelect(node.parent);
          if (select) resyncSelect(select);
        }
        appliedByBinding.set(binding, value);
      } catch (error) {
        if (!deliverToBoundary(node.owner, error)) throw error;
      }
    },
    effectScheduler('effect', (node.owner?.depth ?? 0) + 1),
    null,
    'previous'
  );
  pass.own(binding);
  const install = () => {
    const previous = node.bindings?.get(key);
    (node.bindings ??= new Map()).set(key, binding);
    const reversibleAttribute =
      isSimpleAttribute(tag, key, undefined) ||
      key === 'class' ||
      key === 'className' ||
      key === 'style';
    const reversibleControl =
      isInputValue(tag, key) || isBooleanControl(tag, key);
    if (!fresh) {
      recordBindingInstallUndo(pass, node, key, binding, previous);
      if (reversibleAttribute) {
        recordAttributeUndo(pass, el, getRenderedAttributeName(el, key));
      } else if (isInputValue(tag, key)) {
        recordInputValueUndo(pass, node);
      } else if (isBooleanControl(tag, key)) {
        recordBooleanControlUndo(pass, node, key as 'checked' | 'selected');
      }
    }
    try {
      binding.run();
      if (binding._hasError) throw binding._error;
    } catch (error) {
      if (
        !fresh &&
        (reversibleAttribute || reversibleControl || propertyBacked)
      )
        throw new CommitMutationError(error);
      throw error;
    } finally {
      installing = false;
    }
  };
  if (fresh) install();
  else pass.op(install);
}

/** Point the element's ref at it once the pass commits. */
export function attachRef(pass: Pass, node: HostNode, previous: unknown): void {
  const ref = node.props.ref;
  if (ref === previous) return;
  const el = node.el;
  pass.after(() => {
    const errors: unknown[] = [];
    try {
      if (previous) setRef(previous, null);
    } catch (error) {
      errors.push(error);
    }
    try {
      if (ref) setRef(ref, el);
    } catch (error) {
      errors.push(error);
    }
    throwCollected(errors, 'Ref replacement callbacks failed');
  });
}

/** End a removed element's bindings, listeners, and ref. */
export function releaseProps(node: HostNode, errors: unknown[]): void {
  if (node.bindings) {
    for (const binding of node.bindings.values()) binding.dispose(errors);
    node.bindings = null;
  }
  if (node.listeners) removeAllListeners(node.listeners, node.el, errors);
  const ref = node.props.ref;
  if (ref) {
    try {
      setRef(ref, null);
    } catch (error) {
      errors.push(error);
    }
  }
}
