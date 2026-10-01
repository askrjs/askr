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
import { isCustomElementName } from '../../common/attr-names';
import { getDomPropertyName } from '../../common/dom-properties';
import { isSkippedProp } from '../../common/prop-classification';
import { setRef } from './refs';
import { Computation } from '../reactive/graph';
import { deliverToBoundary } from '../component/errors';
import { recordUndo } from '../component/journal';
import { readValue } from '../reactive/readable';
import { effectScheduler } from '../reactive/scheduler';
import { throwCollected } from '../reactive/owner';
import {
  parseEventProp,
  removeAllListeners,
  removeListener,
  setListener,
} from './events';
import type { Pass } from './pass';
import { CommitMutationError } from './pass';
import { getRenderedAttributeName } from './element-attributes';
import { captureDomPropertyUndo, hasDomPropertyWrite } from './dom-properties';
import { attributeNamespace } from '../../common/attr-names';
import {
  applyScalarPropValue,
  applyStaticScalarPropsToElement,
  isDangerousInnerHTMLPayload,
} from './prop-values';
import { HOST, ROOT, type HostNode, type Parent } from './tree';
import { reportTeardown } from './teardown';

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

function isSimpleAttribute(tag: string, key: string, value: unknown): boolean {
  return (
    !isCustomElementName(tag) &&
    !key.includes(':') &&
    getDomPropertyName(tag, key, value) === null &&
    key !== 'class' &&
    key !== 'className' &&
    key !== 'style' &&
    key !== 'value' &&
    key !== 'checked' &&
    key !== 'selected' &&
    key !== 'dangerouslySetInnerHTML'
  );
}

function isInputValue(tag: string, key: string): boolean {
  return key === 'value' && (tag === 'input' || tag === 'textarea');
}

function isBooleanControl(tag: string, key: string): boolean {
  return (
    (tag === 'input' && key === 'checked') ||
    (tag === 'option' && key === 'selected')
  );
}

/** Record the live attribute before applying a reversible scalar write. */
function writeSimpleAttribute(
  pass: Pass,
  node: HostNode,
  key: string,
  value: unknown,
  previous: unknown,
  beforeApply?: () => void
): void {
  const { el, tag } = node;
  const name = getRenderedAttributeName(el, key);
  pass.op(() => {
    recordAttributeUndo(pass, el, name);
    try {
      beforeApply?.();
      applyScalarPropValue(el, key, value, tag, previous);
    } catch (error) {
      throw new CommitMutationError(error);
    }
  });
}

/** Record a reflected class or style write for an abortable commit. */
function writeReflectedProp(
  pass: Pass,
  node: HostNode,
  key: string,
  apply: () => void,
  beforeApply?: () => void
): void {
  const { el } = node;
  const name = getRenderedAttributeName(el, key);
  pass.op(() => {
    recordAttributeUndo(pass, el, name);
    try {
      beforeApply?.();
      apply();
    } catch (error) {
      throw new CommitMutationError(error);
    }
  });
}

function recordAttributeUndo(pass: Pass, el: Element, name: string): void {
  const namespace = attributeNamespace(el.namespaceURI, name);
  const colon = name.indexOf(':');
  const localName = colon === -1 ? name : name.slice(colon + 1);
  const before = namespace
    ? el.getAttributeNS(namespace, localName)
    : el.getAttribute(name);
  pass.onReversibleCommit(() => {
    if (before === null) {
      if (namespace) el.removeAttributeNS(namespace, localName);
      else el.removeAttribute(name);
    } else if (namespace) {
      el.setAttributeNS(namespace, name, before);
    } else {
      el.setAttribute(name, before);
    }
  });
}

/** Restore exact child identities without needlessly disconnecting unchanged nodes. */
export function restoreElementChildren(
  el: Element,
  children: readonly Node[]
): void {
  if (el.childNodes.length === children.length) {
    let unchanged = true;
    for (let index = 0; index < children.length; index += 1) {
      if (el.childNodes[index] !== children[index]) {
        unchanged = false;
        break;
      }
    }
    if (unchanged) return;
  }
  el.replaceChildren(...children);
}

/** Make property-backed scalar writes part of the pass rollback journal. */
function writePropertyScalar(
  pass: Pass,
  node: HostNode,
  key: string,
  value: unknown,
  apply: () => void
): void {
  pass.op(() => {
    try {
      const undo = captureDomPropertyUndo(node.el, key, value, node.tag);
      if (undo) pass.onReversibleCommit(undo);
      apply();
    } catch (error) {
      throw new CommitMutationError(error);
    }
  });
}

function queueScalarProp(
  pass: Pass,
  node: HostNode,
  key: string,
  value: unknown,
  apply: () => void
): void {
  if (key === 'dangerouslySetInnerHTML') {
    if (!isDangerousInnerHTMLPayload(value)) {
      pass.op(apply);
      return;
    }
    pass.op(() => {
      const children = Array.from(node.el.childNodes);
      pass.onReversibleCommit(() => restoreElementChildren(node.el, children));
      try {
        apply();
      } catch (error) {
        if (error instanceof CommitMutationError) throw error;
        throw new CommitMutationError(error);
      }
    });
    return;
  }
  if (hasDomPropertyWrite(node.el, key, value, node.tag)) {
    writePropertyScalar(pass, node, key, value, apply);
  } else {
    pass.op(() => {
      recordAttributeUndo(
        pass,
        node.el,
        getRenderedAttributeName(node.el, key)
      );
      try {
        apply();
      } catch (error) {
        if (error instanceof CommitMutationError) throw error;
        throw new CommitMutationError(error);
      }
    });
  }
}

/** Remove a committed binding provisionally and restore it if the pass aborts. */
function retireBindingForCommit(
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

/** Restore both the reflected attribute and the live form value on abort. */
function writeInputValue(
  pass: Pass,
  node: HostNode,
  value: unknown,
  previous: unknown
): void {
  const { el, tag } = node;
  pass.op(() => {
    recordInputValueUndo(pass, node);
    try {
      applyScalarPropValue(el, 'value', value, tag, previous);
    } catch (error) {
      throw new CommitMutationError(error);
    }
  });
}

/** Restore a checkbox or option's live state and reflected attribute. */
function writeBooleanControl(
  pass: Pass,
  node: HostNode,
  key: 'checked' | 'selected',
  value: unknown,
  previous: unknown
): void {
  const { el, tag } = node;
  pass.op(() => {
    recordBooleanControlUndo(pass, node, key);
    try {
      applyScalarPropValue(el, key, value, tag, previous);
    } catch (error) {
      throw new CommitMutationError(error);
    }
  });
}

function recordInputValueUndo(pass: Pass, node: HostNode): void {
  const control = node.el as HTMLInputElement | HTMLTextAreaElement;
  const beforeValue = control.value;
  const beforeAttribute = node.el.getAttribute('value');
  pass.onReversibleCommit(() => {
    if (beforeAttribute === null) node.el.removeAttribute('value');
    else node.el.setAttribute('value', beforeAttribute);
    control.value = beforeValue;
  });
}

function recordBooleanControlUndo(
  pass: Pass,
  node: HostNode,
  key: 'checked' | 'selected'
): void {
  const control = node.el as HTMLInputElement & HTMLOptionElement;
  const beforeValue = control[key];
  const beforeAttribute = node.el.getAttribute(key);
  pass.onReversibleCommit(() => {
    if (beforeAttribute === null) node.el.removeAttribute(key);
    else node.el.setAttribute(key, beforeAttribute);
    control[key] = beforeValue;
  });
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

function setHandlerForCommit(
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
      for (const key in batch) {
        const value = batch[key];
        if (isInputValue(node.tag, key)) {
          writeInputValue(pass, node, value, undefined);
        } else if (isBooleanControl(node.tag, key)) {
          writeBooleanControl(
            pass,
            node,
            key as 'checked' | 'selected',
            value,
            undefined
          );
        } else if (isSimpleAttribute(node.tag, key, value)) {
          writeSimpleAttribute(pass, node, key, value, undefined);
        } else if (key === 'class' || key === 'className' || key === 'style') {
          writeReflectedProp(pass, node, key, () =>
            applyStaticScalarPropsToElement(node.el, { [key]: value }, node.tag)
          );
        } else {
          queueScalarProp(pass, node, key, value, () =>
            applyStaticScalarPropsToElement(node.el, { [key]: value }, node.tag)
          );
        }
      }
    } else {
      applyStaticScalarPropsToElement(node.el, batch, node.tag);
    }
  };
  for (const key in props) {
    if (isSkippedProp(key)) continue;
    const value = props[key];
    if (parseEventProp(key)) {
      flushScalars();
      if (adopted) {
        setHandlerForCommit(pass, node, key, value, undefined);
      } else {
        setHandler(node, key, value);
        // Registering delegates the event type; a discarded or rewound render
        // releases it, or the delegation outlives every element using it.
        recordUndo(() => setHandler(node, key, undefined));
      }
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
function captureSelectUndo(select: HTMLSelectElement): () => void {
  const beforeValue = select.getAttribute('value');
  const beforeIndex = select.selectedIndex;
  const beforeOptions = Array.from(select.options, (option) => ({
    option,
    selected: option.selected,
    attribute: option.hasAttribute('selected'),
  }));
  return () => {
    if (beforeValue === null) select.removeAttribute('value');
    else select.setAttribute('value', beforeValue);
    for (const { option, attribute } of beforeOptions) {
      if (attribute) option.setAttribute('selected', '');
      else option.removeAttribute('selected');
    }
    if (select.multiple) {
      for (const { option, selected } of beforeOptions)
        option.selected = selected;
    } else {
      select.selectedIndex = beforeIndex;
    }
  };
}

export function recordSelectUndo(pass: Pass, node: HostNode): void {
  pass.onReversibleCommit(captureSelectUndo(node.el as HTMLSelectElement));
}

export function applyTrailingProps(
  pass: Pass,
  node: HostNode,
  props: Props,
  initial = false,
  adopted = false
): void {
  if (node.tag !== 'select' || !('value' in props)) return;
  if (initial && adopted) pass.op(() => recordSelectUndo(pass, node));
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
  const writeValue = () => {
    try {
      applyScalarPropValue(node.el, 'value', props.value, node.tag, undefined);
    } catch (error) {
      if (initial && !adopted) throw error;
      throw new CommitMutationError(error);
    }
  };
  if (initial && adopted) {
    pass.op(writeValue);
  } else {
    writeValue();
  }
}

/** The select whose options include content under `parent`, if any. */
export function enclosingSelect(parent: Parent | null): HostNode | null {
  for (let p: Parent | null = parent; p; p = p.parent) {
    if (p.kind !== HOST) {
      if (p.kind === ROOT) return null;
      continue;
    }
    if (p.tag === 'select') return p;
    if (p.tag !== 'optgroup' && p.tag !== 'option') return null;
  }
  return null;
}

/**
 * Re-apply a committed select's controlled value against its current
 * options. Its options changed without the select itself being patched.
 */
export function resyncSelect(select: HostNode): void {
  if (select.dormant || !('value' in select.props)) return;
  const value = select.props.value;
  const resolved =
    typeof value === 'function' ? readValue(value as () => unknown) : value;
  const undo = captureSelectUndo(select.el as HTMLSelectElement);
  try {
    applyScalarPropValue(select.el, 'value', resolved, select.tag, undefined);
  } catch (error) {
    try {
      undo();
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Controlled select resynchronization and rollback failed'
      );
    }
    throw error;
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
    if (followsChildren(tag, key)) {
      pass.op(() => recordSelectUndo(pass, node));
    }
    const old = previous[key];
    if (parseEventProp(key)) {
      setHandlerForCommit(pass, node, key, undefined, old);
    } else if (!isBinding(key, old) && isInputValue(tag, key)) {
      writeInputValue(pass, node, undefined, old);
    } else if (!isBinding(key, old) && isBooleanControl(tag, key)) {
      writeBooleanControl(
        pass,
        node,
        key as 'checked' | 'selected',
        undefined,
        old
      );
    } else if (!isBinding(key, old) && isSimpleAttribute(tag, key, undefined)) {
      writeSimpleAttribute(pass, node, key, undefined, old);
    } else if (
      !isBinding(key, old) &&
      (key === 'class' || key === 'className' || key === 'style')
    ) {
      writeReflectedProp(pass, node, key, () =>
        applyScalarPropValue(el, key, undefined, tag, old)
      );
    } else if (isBinding(key, old) && isSimpleAttribute(tag, key, undefined)) {
      const binding = node.bindings?.get(key);
      writeSimpleAttribute(
        pass,
        node,
        key,
        undefined,
        lastApplied(binding),
        () => retireBindingForCommit(pass, node, key)
      );
    } else if (
      isBinding(key, old) &&
      (key === 'class' || key === 'className' || key === 'style')
    ) {
      const binding = node.bindings?.get(key);
      writeReflectedProp(
        pass,
        node,
        key,
        () =>
          applyScalarPropValue(el, key, undefined, tag, lastApplied(binding)),
        () => retireBindingForCommit(pass, node, key)
      );
    } else {
      queueScalarProp(pass, node, key, undefined, () => {
        const binding = retireBindingForCommit(pass, node, key);
        const from = isBinding(key, old) ? lastApplied(binding) : old;
        try {
          applyScalarPropValue(el, key, undefined, tag, from);
        } catch (error) {
          if (!followsChildren(tag, key)) throw error;
          throw new CommitMutationError(error);
        }
      });
    }
  }

  for (const key in next) {
    if (isSkippedProp(key)) continue;
    if (followsChildren(tag, key)) {
      pass.op(() => recordSelectUndo(pass, node));
    }
    const value = next[key];
    const old = previous[key];
    if (parseEventProp(key)) {
      if (value !== old) {
        setHandlerForCommit(pass, node, key, value, old);
      }
      continue;
    }
    if (isBinding(key, value)) {
      if (value === old && node.bindings?.has(key)) continue;
      const replaced = node.bindings?.get(key);
      const from = replaced ? lastApplied(replaced) : old;
      pass.op(() => retireBindingForCommit(pass, node, key));
      bind(pass, node, key, value, from, false);
      continue;
    }
    if (isBinding(key, old)) {
      const binding = node.bindings?.get(key);
      const from = lastApplied(binding);
      if (isSimpleAttribute(tag, key, value)) {
        writeSimpleAttribute(pass, node, key, value, from, () =>
          retireBindingForCommit(pass, node, key)
        );
      } else if (key === 'class' || key === 'className' || key === 'style') {
        writeReflectedProp(
          pass,
          node,
          key,
          () => applyScalarPropValue(el, key, value, tag, from),
          () => retireBindingForCommit(pass, node, key)
        );
      } else {
        queueScalarProp(pass, node, key, value, () => {
          const current = retireBindingForCommit(pass, node, key);
          applyScalarPropValue(el, key, value, tag, lastApplied(current));
        });
      }
      continue;
    }
    // A host may change a rendered value between passes. The scalar writer
    // compares against the live DOM and leaves equal values untouched.
    if (Object.is(value, old) && key === 'dangerouslySetInnerHTML') continue;
    if (isInputValue(tag, key)) {
      writeInputValue(pass, node, value, old);
    } else if (isBooleanControl(tag, key)) {
      writeBooleanControl(
        pass,
        node,
        key as 'checked' | 'selected',
        value,
        old
      );
    } else if (isSimpleAttribute(tag, key, value)) {
      writeSimpleAttribute(pass, node, key, value, old);
    } else if (key === 'class' || key === 'className' || key === 'style') {
      writeReflectedProp(pass, node, key, () =>
        applyScalarPropValue(el, key, value, tag, old)
      );
    } else {
      queueScalarProp(pass, node, key, value, () => {
        try {
          applyScalarPropValue(el, key, value, tag, old);
        } catch (error) {
          if (!followsChildren(tag, key)) throw error;
          throw new CommitMutationError(error);
        }
      });
    }
  }
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
