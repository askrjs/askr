import { applyScalarPropValue } from '../props/attributes';
import { isFragmentVNode } from '../children/child-shape';
import { _isDOMElement, type DOMElement } from '../types';
import { extractKey, tagNamesEqualIgnoreCase } from '../utils';
import type {
  BlueprintChildShape,
  BlueprintElementShape,
  BlueprintPropShape,
  IntrinsicBlueprint,
  ReactiveSlotShape,
} from './blueprint-types';

export function getVNodeChildren(vnode: DOMElement): unknown {
  return vnode.props?.children ?? vnode.children;
}

export function getDirectReactiveCompute(
  value: unknown
): (() => unknown) | null {
  if (typeof value === 'function') {
    return value as () => unknown;
  }
  if (Array.isArray(value)) {
    return value.length === 1 ? getDirectReactiveCompute(value[0]) : null;
  }
  if (typeof value === 'object' && value !== null && isFragmentVNode(value)) {
    return getDirectReactiveCompute(getVNodeChildren(value));
  }
  return null;
}

const ownerBlueprints = new WeakMap<
  object,
  WeakMap<Document, Map<string, IntrinsicBlueprint>>
>();

function getBlueprintKey(parentNamespace?: string): string {
  return parentNamespace ?? '';
}

export function getBlueprint(
  owner: object,
  ownerDocument: Document,
  parentNamespace?: string
): IntrinsicBlueprint | undefined {
  return ownerBlueprints
    .get(owner)
    ?.get(ownerDocument)
    ?.get(getBlueprintKey(parentNamespace));
}

export function cacheBlueprint(
  owner: object,
  ownerDocument: Document,
  parentNamespace: string | undefined,
  blueprint: IntrinsicBlueprint
): void {
  let byDocument = ownerBlueprints.get(owner);
  if (!byDocument) {
    byDocument = new WeakMap();
    ownerBlueprints.set(owner, byDocument);
  }

  let byNamespace = byDocument.get(ownerDocument);
  if (!byNamespace) {
    byNamespace = new Map();
    byDocument.set(ownerDocument, byNamespace);
  }

  const key = getBlueprintKey(parentNamespace);
  if (!byNamespace.has(key)) {
    byNamespace.set(key, blueprint);
  }
}

export function isBlueprintKeyProp(key: string): boolean {
  return key === 'key' || key === 'data-key' || key === 'data-askr-key-kind';
}

function classifyProp(value: unknown, key: string): BlueprintPropShape | null {
  if (key === 'ref') {
    return { kind: 'ref' };
  }
  if (key === 'dangerouslySetInnerHTML') {
    return null;
  }
  if (key.startsWith('on') && key.length > 2) {
    return typeof value === 'function' ? { kind: 'event' } : null;
  }
  if (typeof value === 'function') {
    return { kind: 'reactive' };
  }
  if (value === undefined || value === null || value === false) {
    return { kind: 'empty' };
  }
  if (typeof value === 'object') {
    return null;
  }
  return { kind: 'static', value };
}

function collectReactiveSlotShapes(
  value: unknown,
  slots: ReactiveSlotShape[]
): boolean {
  if (Array.isArray(value)) {
    for (const child of value) {
      if (!collectReactiveSlotShapes(child, slots)) return false;
    }
    return true;
  }
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === 'function') {
    slots.push({ kind: 'dynamic' });
    return true;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    slots.push({ kind: 'static', value: String(value) });
    return true;
  }
  if (typeof value === 'object' && value !== null && isFragmentVNode(value)) {
    return collectReactiveSlotShapes(getVNodeChildren(value), slots);
  }
  return false;
}

function collectStaticVNodeChildren(
  value: unknown,
  children: Array<DOMElement | string>
): boolean {
  if (Array.isArray(value)) {
    for (const child of value) {
      if (!collectStaticVNodeChildren(child, children)) return false;
    }
    return true;
  }
  if (value === null || value === undefined || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    children.push(String(value));
    return true;
  }
  if (_isDOMElement(value)) {
    if (typeof value.type === 'string') {
      children.push(value);
      return true;
    }
    if (typeof value.type === 'symbol' && isFragmentVNode(value)) {
      return collectStaticVNodeChildren(getVNodeChildren(value), children);
    }
  }
  return false;
}

function buildElementShape(
  template: Element,
  vnode: DOMElement
): BlueprintElementShape | null {
  if (
    typeof vnode.type !== 'string' ||
    !tagNamesEqualIgnoreCase(template.tagName, vnode.type)
  ) {
    return null;
  }

  const props = (vnode.props ?? {}) as Record<string, unknown>;
  const propShapes = Object.create(null) as Record<string, BlueprintPropShape>;
  let propCount = 0;
  for (const key in props) {
    if (key === 'children' || isBlueprintKeyProp(key)) continue;
    const propShape = classifyProp(props[key], key);
    if (!propShape) return null;
    propShapes[key] = propShape;
    propCount += 1;
    if (propShape.kind === 'reactive') {
      applyScalarPropValue(template, key, null, vnode.type);
    }
  }

  if (extractKey(vnode) !== undefined) template.removeAttribute('data-key');

  const children = vnode.props?.children ?? vnode.children;
  const reactiveSlots: ReactiveSlotShape[] = [];
  if (collectReactiveSlotShapes(children, reactiveSlots)) {
    const hasDynamic = reactiveSlots.some((slot) => slot.kind === 'dynamic');
    if (hasDynamic) {
      if (template.childNodes.length !== reactiveSlots.length) return null;
      for (let index = 0; index < reactiveSlots.length; index += 1) {
        const child = template.childNodes[index];
        const slot = reactiveSlots[index]!;
        if (!child || child.nodeType !== Node.TEXT_NODE) return null;
        if (slot.kind === 'static' && (child as Text).data !== slot.value) {
          return null;
        }
        if (slot.kind === 'dynamic') (child as Text).data = '';
      }
      return {
        tagName: vnode.type,
        namespaceURI: template.namespaceURI,
        propCount,
        props: propShapes,
        children: { kind: 'reactive', slots: reactiveSlots },
      };
    }
  }

  const staticChildren: Array<DOMElement | string> = [];
  if (!collectStaticVNodeChildren(children, staticChildren)) return null;
  if (template.childNodes.length !== staticChildren.length) return null;

  const childShapes: BlueprintChildShape[] = [];
  for (let index = 0; index < staticChildren.length; index += 1) {
    const child = staticChildren[index]!;
    const templateChild = template.childNodes[index]!;
    if (typeof child === 'string') {
      if (
        templateChild.nodeType !== Node.TEXT_NODE ||
        (templateChild as Text).data !== child
      ) {
        return null;
      }
      childShapes.push({ kind: 'text', value: child });
      continue;
    }
    if (!(templateChild instanceof Element)) return null;
    const shape = buildElementShape(templateChild, child);
    if (!shape) return null;
    childShapes.push({ kind: 'element', shape });
  }

  return {
    tagName: vnode.type,
    namespaceURI: template.namespaceURI,
    propCount,
    props: propShapes,
    children: { kind: 'static', slots: childShapes },
  };
}

export function buildBlueprint(
  element: Element,
  vnode: DOMElement
): IntrinsicBlueprint | null {
  const template = element.cloneNode(true) as Element;
  const shape = buildElementShape(template, vnode);
  return shape
    ? {
        template,
        shape,
        elementCount: countBlueprintElements(shape),
      }
    : null;
}

function countBlueprintElements(shape: BlueprintElementShape): number {
  if (shape.children.kind === 'reactive') {
    return 1;
  }

  return (
    1 +
    shape.children.slots.reduce(
      (count, slot) =>
        count +
        (slot.kind === 'element' ? countBlueprintElements(slot.shape) : 0),
      0
    )
  );
}

export function matchPropShape(
  expected: BlueprintPropShape,
  value: unknown,
  key: string
): boolean {
  switch (expected.kind) {
    case 'ref':
      return key === 'ref';
    case 'event':
      return (
        key.startsWith('on') && key.length > 2 && typeof value === 'function'
      );
    case 'reactive':
      return (
        !(key.startsWith('on') && key.length > 2) && typeof value === 'function'
      );
    case 'empty':
      return value === undefined || value === null || value === false;
    case 'static':
      return typeof value !== 'object' && Object.is(value, expected.value);
  }
}

export function matchReactiveSlots(
  value: unknown,
  slots: ReactiveSlotShape[],
  startIndex: number
): number {
  if (Array.isArray(value)) {
    let index = startIndex;
    for (const child of value) {
      index = matchReactiveSlots(child, slots, index);
      if (index < 0) return -1;
    }
    return index;
  }
  if (value === null || value === undefined || value === false)
    return startIndex;
  const slot = slots[startIndex];
  if (!slot) return -1;
  if (typeof value === 'function')
    return slot.kind === 'dynamic' ? startIndex + 1 : -1;
  if (typeof value === 'string' || typeof value === 'number') {
    return slot.kind === 'static' && slot.value === String(value)
      ? startIndex + 1
      : -1;
  }
  if (typeof value === 'object' && value !== null && isFragmentVNode(value)) {
    return matchReactiveSlots(getVNodeChildren(value), slots, startIndex);
  }
  return -1;
}
