import { materializeFreshKey } from './attributes';
import { isFragmentVNode } from './child-shape';
import {
  getDirectReactiveCompute,
  getVNodeChildren,
  isBlueprintKeyProp,
  matchPropShape,
  matchReactiveSlots,
} from './intrinsic-blueprint-analysis';
import {
  BlueprintBinding,
  cleanupBlueprintElement,
  mountBlueprintBindingGroup,
  publishPreparedBlueprintBindings,
  syncPreparedBlueprintChild,
} from './intrinsic-blueprint-bindings';
import type {
  BlueprintChildShape,
  BlueprintElementShape,
  IntrinsicBlueprint,
} from './intrinsic-blueprint-types';
import { _isDOMElement, type DOMElement } from './types';
import type { ReactiveChildDOMHost } from './reactive-children';

const BLUEPRINT_PUBLISH_BINDINGS = 0;
const BLUEPRINT_SYNC_REACTIVE_CHILD = 1;

export function prepareElementBlueprint(
  element: Element,
  vnode: DOMElement,
  shape: BlueprintElementShape,
  bindings: BlueprintBinding[],
  deferred: unknown[]
): boolean {
  const vnodeType = vnode.type;
  if (
    typeof vnodeType !== 'string' ||
    (shape.tagName !== vnodeType &&
      shape.tagName.toLowerCase() !== vnodeType.toLowerCase())
  ) {
    return false;
  }

  const props = (vnode.props ?? {}) as Record<string, unknown>;
  let propCount = 0;
  let shouldPublishBindings = false;
  for (const key in props) {
    if (key === 'children' || isBlueprintKeyProp(key)) continue;
    const expected = shape.props[key];
    if (!expected || !matchPropShape(expected, props[key], key)) return false;
    propCount += 1;
    if (expected.kind === 'reactive') {
      bindings.push(
        new BlueprintBinding(
          'prop',
          element,
          props[key] as () => unknown,
          key,
          vnodeType,
          null
        )
      );
    } else if (expected.kind === 'event' || expected.kind === 'ref') {
      shouldPublishBindings = true;
    }
  }
  if (propCount !== shape.propCount) return false;

  materializeFreshKey(element, vnode, props);
  if (shouldPublishBindings) {
    deferred.push(BLUEPRINT_PUBLISH_BINDINGS, element, props);
  }

  const children = vnode.props?.children ?? vnode.children;
  if (shape.children.kind === 'reactive') {
    if (
      shape.children.slots.length === 1 &&
      shape.children.slots[0]?.kind === 'dynamic'
    ) {
      const compute = getDirectReactiveCompute(children);
      const textNode = element.firstChild;
      if (compute) {
        bindings.push(
          new BlueprintBinding('text', element, compute, null, null, textNode as Text)
        );
        return true;
      }
    }
    if (
      matchReactiveSlots(children, shape.children.slots, 0) !==
      shape.children.slots.length
    ) {
      return false;
    }
    deferred.push(BLUEPRINT_SYNC_REACTIVE_CHILD, element, children);
    return true;
  }

  if (
    shape.children.slots.length === 0 &&
    (children === null || children === undefined || typeof children === 'boolean')
  ) {
    return true;
  }

  const staticSlot =
    shape.children.slots.length === 1 ? shape.children.slots[0] : undefined;
  if (
    staticSlot?.kind === 'element' &&
    _isDOMElement(children) &&
    typeof children.type === 'string'
  ) {
    const childNode = element.firstChild;
    if (!(childNode instanceof Element)) return false;
    return prepareElementBlueprint(
      childNode,
      children,
      staticSlot.shape,
      bindings,
      deferred
    );
  }

  return (
    prepareStaticSlots(
      element,
      children,
      shape.children.slots,
      0,
      bindings,
      deferred
    ) === shape.children.slots.length
  );
}

function prepareStaticSlots(
  element: Element,
  value: unknown,
  slots: BlueprintChildShape[],
  startIndex: number,
  bindings: BlueprintBinding[],
  deferred: unknown[]
): number {
  if (Array.isArray(value)) {
    let index = startIndex;
    for (const child of value) {
      index = prepareStaticSlots(
        element,
        child,
        slots,
        index,
        bindings,
        deferred
      );
      if (index < 0) return -1;
    }
    return index;
  }
  if (value === null || value === undefined || typeof value === 'boolean') {
    return startIndex;
  }

  const slot = slots[startIndex];
  const childNode = element.childNodes[startIndex];
  if (typeof value === 'string' || typeof value === 'number') {
    return slot?.kind === 'text' && slot.value === String(value)
      ? startIndex + 1
      : -1;
  }
  if (!_isDOMElement(value)) return -1;
  if (typeof value.type === 'symbol') {
    return isFragmentVNode(value)
      ? prepareStaticSlots(
          element,
          getVNodeChildren(value),
          slots,
          startIndex,
          bindings,
          deferred
        )
      : -1;
  }
  if (slot?.kind === 'element' && childNode !== undefined) {
    return prepareElementBlueprint(
      childNode as Element,
      value,
      slot.shape,
      bindings,
      deferred
    )
      ? startIndex + 1
      : -1;
  }
  return -1;
}

function publishPreparedBlueprint(
  deferred: unknown[],
  host: ReactiveChildDOMHost
): void {
  for (let index = 0; index < deferred.length; index += 3) {
    const operation = deferred[index];
    const element = deferred[index + 1] as Element;
    const value = deferred[index + 2];
    if (operation === BLUEPRINT_PUBLISH_BINDINGS) {
      publishPreparedBlueprintBindings(element, value as Record<string, unknown>);
    } else if (!syncPreparedBlueprintChild(element, value, host)) {
      throw new Error('[askr] Component blueprint reactive shape changed.');
    }
  }
}

export function instantiateBlueprint(
  blueprint: IntrinsicBlueprint,
  vnode: DOMElement,
  host: ReactiveChildDOMHost
): Element | null {
  const element = blueprint.template.cloneNode(true) as Element;
  const bindings: BlueprintBinding[] = [];
  const deferred: unknown[] = [];
  if (!prepareElementBlueprint(element, vnode, blueprint.shape, bindings, deferred)) {
    return null;
  }

  try {
    publishPreparedBlueprint(deferred, host);
    mountBlueprintBindingGroup(bindings, host);
    return element;
  } catch (error) {
    try {
      cleanupBlueprintElement(element);
    } catch {
      // Preserve the binding/materialization error.
    }
    throw error;
  }
}
