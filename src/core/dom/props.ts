/**
 * Element props: which prop is an attribute value, an event handler, a ref,
 * or a binding, and when each is written.
 *
 * On a new, detached element props are written directly. On a committed
 * element every write is recorded as a pass operation. A function-valued
 * prop other than a handler or ref is a binding: a computation owned by the
 * element's component that re-applies the prop when what it reads changes.
 * How a value is written lives in `prop-values`.
 */

import type { Props } from '../../common/props';
import { isSkippedProp } from '../../common/prop-classification';
import { setRef } from './refs';
import { Computation } from '../reactive/graph';
import { deliverToBoundary } from '../component/errors';
import { readValue } from '../reactive/readable';
import { effectScheduler } from '../reactive/scheduler';
import {
  parseEventProp,
  removeAllListeners,
  removeListener,
  setListener,
} from './events';
import type { Pass } from './pass';
import {
  applyScalarPropValue,
  applyStaticScalarPropsToElement,
} from './prop-values';
import type { HostNode } from './tree';

function isBinding(key: string, value: unknown): value is () => unknown {
  return (
    typeof value === 'function' &&
    key !== 'ref' &&
    key !== 'dangerouslySetInnerHTML'
  );
}

/** A `<select>` value can only select options that already exist. */
function followsChildren(tag: string, key: string): boolean {
  return key === 'value' && tag === 'select';
}

/** The last value each binding applied, for diffing its next write. */
const appliedByBinding = new WeakMap<Computation<void>, unknown>();

function lastApplied(binding: Computation<void> | undefined): unknown {
  return binding ? appliedByBinding.get(binding) : undefined;
}

function setHandler(node: HostNode, key: string, value: unknown): void {
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

/**
 * Write props to an element that has no committed props yet: a new, detached
 * element (written now) or an adopted server element (`adopted`: recorded as
 * commit operations).
 */
export function applyInitialProps(
  pass: Pass,
  node: HostNode,
  adopted = false
): void {
  const props = node.props;
  let scalars: Record<string, unknown> | null = null;
  const flushScalars = () => {
    if (!scalars) return;
    const batch = scalars;
    scalars = null;
    if (adopted) {
      pass.op(() => applyStaticScalarPropsToElement(node.el, batch, node.tag));
    } else {
      applyStaticScalarPropsToElement(node.el, batch, node.tag);
    }
  };
  for (const key in props) {
    if (isSkippedProp(key)) continue;
    const value = props[key];
    if (parseEventProp(key)) {
      flushScalars();
      if (adopted) pass.op(() => setHandler(node, key, value));
      else setHandler(node, key, value);
    } else if (isBinding(key, value)) {
      flushScalars();
      if (!followsChildren(node.tag, key)) {
        bind(pass, node, key, value, undefined, !adopted);
      }
    } else if (!followsChildren(node.tag, key)) {
      (scalars ??= {})[key] = value;
    }
  }
  flushScalars();
}

/** Write props that must follow the element's children. */
export function applyTrailingProps(
  pass: Pass,
  node: HostNode,
  props: Props,
  initial = false,
  adopted = false
): void {
  if (node.tag !== 'select' || !('value' in props)) return;
  if (typeof props.value === 'function') {
    if (initial)
      bind(
        pass,
        node,
        'value',
        props.value as () => unknown,
        undefined,
        !adopted
      );
    else node.bindings?.get('value')?.run();
    return;
  }
  if (initial && adopted) {
    pass.op(() =>
      applyScalarPropValue(node.el, 'value', props.value, node.tag, undefined)
    );
  } else {
    applyScalarPropValue(node.el, 'value', props.value, node.tag, undefined);
  }
}

/** Record the writes that turn `previous` into `next` on a committed element. */
export function patchProps(
  pass: Pass,
  node: HostNode,
  previous: Props,
  next: Props
): void {
  const { el, tag } = node;
  for (const key in previous) {
    if (key in next || isSkippedProp(key)) continue;
    const old = previous[key];
    if (parseEventProp(key)) {
      pass.op(() => setHandler(node, key, undefined));
    } else {
      pass.op(() => {
        const binding = unbind(node, key);
        const from = isBinding(key, old) ? lastApplied(binding) : old;
        applyScalarPropValue(el, key, undefined, tag, from);
      });
    }
  }

  for (const key in next) {
    if (isSkippedProp(key)) continue;
    const value = next[key];
    const old = previous[key];
    if (parseEventProp(key)) {
      if (value !== old) pass.op(() => setHandler(node, key, value));
      continue;
    }
    if (isBinding(key, value)) {
      if (value === old && node.bindings?.has(key)) continue;
      const replaced = node.bindings?.get(key);
      const from = replaced ? lastApplied(replaced) : old;
      pass.op(() => unbind(node, key));
      bind(pass, node, key, value, from, false);
      continue;
    }
    if (isBinding(key, old)) {
      pass.op(() => {
        const binding = unbind(node, key);
        applyScalarPropValue(el, key, value, tag, lastApplied(binding));
      });
      continue;
    }
    // A host may change a rendered value between passes. The scalar writer
    // compares against the live DOM and leaves equal values untouched.
    if (Object.is(value, old) && key === 'dangerouslySetInnerHTML') continue;
    pass.op(() => applyScalarPropValue(el, key, value, tag, old));
  }
}

function unbind(node: HostNode, key: string): Computation<void> | undefined {
  const binding = node.bindings?.get(key);
  if (binding) {
    node.bindings!.delete(key);
    binding.dispose();
  }
  return binding;
}

function bind(
  pass: Pass,
  node: HostNode,
  key: string,
  read: () => unknown,
  previousValue: unknown,
  fresh: boolean
): void {
  const { el, tag } = node;
  let last = previousValue;
  const binding: Computation<void> = new Computation<void>(
    node.owner,
    () => {
      try {
        const value = key.startsWith('prop:') ? read() : readValue(read);
        applyScalarPropValue(el, key, value, tag, last);
        last = value;
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
    (node.bindings ??= new Map()).set(key, binding);
    binding.run();
    if (binding._hasError) throw binding._error;
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
    if (previous) setRef(previous, null);
    if (ref) setRef(ref, el);
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
