/** Host prop orchestration preserves initial, child-trailing and patch order. */
import type { Props } from '../../common/props';
import { isSkippedProp } from '../../common/prop-classification';
import { recordUndo } from '../component/journal';
import { sameInnerHTMLPayload } from './prop-value-html';
import { parseEventProp } from './events';
import { CommitMutationError, type Pass } from './pass';
import {
  applyScalarPropValue,
  applyStaticScalarPropsToElement,
} from './prop-values';
import type { HostNode } from './tree';
import {
  isBinding,
  followsChildren,
  isSimpleAttribute,
  isInputValue,
  isBooleanControl,
} from './prop-policy';
import {
  writeSimpleAttribute,
  writeReflectedProp,
  queueScalarProp,
  writeInputValue,
  writeBooleanControl,
} from './prop-transaction';
import {
  bind,
  lastApplied,
  retireBindingForCommit,
  setHandler,
  setHandlerForCommit,
} from './prop-lifecycle';
import { recordSelectUndo } from './prop-select';

export { attachRef, releaseProps } from './prop-lifecycle';
export { restoreElementChildren } from './prop-transaction';
export { recordSelectUndo, enclosingSelect, resyncSelect } from './prop-select';

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
    } else if (isBinding(key, value, node.tag)) {
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

/**
 * Props whose DOM state can change without the renderer: form control state,
 * and `prop:` writes (hydration removes the attribute a reflected property
 * adds, so the property is written again on the next update).
 */
function isLiveFormProp(key: string): boolean {
  return (
    key === 'value' ||
    key === 'checked' ||
    key === 'selected' ||
    // Properties the user or the browser changes on their own.
    key === 'indeterminate' ||
    key === 'muted' ||
    key === 'open' ||
    key.startsWith('prop:')
  );
}

/** Whether `value` renders exactly what `old` rendered. */
function sameAppliedValue(key: string, value: unknown, old: unknown): boolean {
  if (Object.is(value, old)) return true;
  if (key === 'dangerouslySetInnerHTML')
    return sameInnerHTMLPayload(value, old);
  if (
    key === 'style' &&
    typeof value === 'object' &&
    typeof old === 'object' &&
    value !== null &&
    old !== null &&
    !Array.isArray(value) &&
    !Array.isArray(old)
  ) {
    return shallowEqual(value as object, old as object);
  }
  return false;
}

function shallowEqual(a: object, b: object): boolean {
  let count = 0;
  for (const name in a) {
    if (!Object.is((a as never)[name], (b as never)[name])) return false;
    if (!(name in b)) return false;
    count++;
  }
  for (const _ in b) count--;
  return count === 0;
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
    } else if (!isBinding(key, old, tag) && isInputValue(tag, key)) {
      writeInputValue(pass, node, undefined, old);
    } else if (!isBinding(key, old, tag) && isBooleanControl(tag, key)) {
      writeBooleanControl(
        pass,
        node,
        key as 'checked' | 'selected',
        undefined,
        old
      );
    } else if (
      !isBinding(key, old, tag) &&
      isSimpleAttribute(tag, key, undefined)
    ) {
      writeSimpleAttribute(pass, node, key, undefined, old);
    } else if (
      !isBinding(key, old, tag) &&
      (key === 'class' || key === 'className' || key === 'style')
    ) {
      writeReflectedProp(pass, node, key, () =>
        applyScalarPropValue(el, key, undefined, tag, old)
      );
    } else if (
      isBinding(key, old, tag) &&
      isSimpleAttribute(tag, key, undefined)
    ) {
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
      isBinding(key, old, tag) &&
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
        const from = isBinding(key, old, tag) ? lastApplied(binding) : old;
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
    if (isBinding(key, value, node.tag)) {
      if (value === old && node.bindings?.has(key)) continue;
      const replaced = node.bindings?.get(key);
      const from = replaced ? lastApplied(replaced) : old;
      pass.op(() => retireBindingForCommit(pass, node, key));
      bind(pass, node, key, value, from, false);
      continue;
    }
    if (isBinding(key, old, tag)) {
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
    // A value equal to the one last applied needs no DOM read or write. Form
    // control state is the exception: the user changes it without the
    // renderer's involvement, so the writer verifies it against the live DOM.
    if (!isLiveFormProp(key) && sameAppliedValue(key, value, old)) continue;
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
