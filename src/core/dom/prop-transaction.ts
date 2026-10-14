/** DOM snapshots and reversible writes use the owning Pass journal. */
import { attributeNamespace } from '../../common/attr-names';
import { getRenderedAttributeName } from './element-attributes';
import { captureDomPropertyUndo, hasDomPropertyWrite } from './dom-properties';
import {
  applyScalarPropValue,
  isDangerousInnerHTMLPayload,
} from './prop-values';
import { CommitMutationError, type Pass } from './pass';
import type { HostNode } from './tree';

/** Record the live attribute before applying a reversible scalar write. */
export function writeSimpleAttribute(
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
export function writeReflectedProp(
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

export function recordAttributeUndo(
  pass: Pass,
  el: Element,
  name: string
): void {
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

export function queueScalarProp(
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

/** Restore both the reflected attribute and the live form value on abort. */
export function writeInputValue(
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
export function writeBooleanControl(
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

export function recordInputValueUndo(pass: Pass, node: HostNode): void {
  const control = node.el as HTMLInputElement | HTMLTextAreaElement;
  const beforeValue = control.value;
  const beforeAttribute = node.el.getAttribute('value');
  pass.onReversibleCommit(() => {
    if (beforeAttribute === null) node.el.removeAttribute('value');
    else node.el.setAttribute('value', beforeAttribute);
    control.value = beforeValue;
  });
}

export function recordBooleanControlUndo(
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
