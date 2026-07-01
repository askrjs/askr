import { _isDOMElement, type VNode } from './types';
import { isFragmentVNode, normalizeComponentChildren } from './child-shape';

export type ReactiveScalarChildSourceSlot =
  | { kind: 'static'; value: string }
  | { kind: 'dynamic'; compute: () => unknown };

export type ReactiveScalarChildSource = ReactiveScalarChildSourceSlot[];

export type ReactiveChildBoundarySequenceSource = Array<
  | { kind: 'static-text'; value: string }
  | { kind: 'static-node'; value: VNode }
  | { kind: 'dynamic'; compute: () => VNode }
>;

function collectReactiveScalarSequenceValue(
  value: unknown,
  normalized: string[]
): boolean {
  if (isFragmentVNode(value)) {
    const fragmentChildren = value.props?.children ?? value.children;
    return collectReactiveScalarSequenceValue(fragmentChildren, normalized);
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      if (!collectReactiveScalarSequenceValue(child, normalized)) {
        return false;
      }
    }
    return true;
  }

  if (value === null || value === undefined || value === false) {
    return true;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    normalized.push(String(value));
    return true;
  }

  return false;
}

function collectReactiveScalarChildSource(
  children: unknown,
  slots: ReactiveScalarChildSource,
  state: { hasDynamic: boolean }
): boolean {
  if (isFragmentVNode(children)) {
    const fragmentChildren = children.props?.children ?? children.children;
    return collectReactiveScalarChildSource(fragmentChildren, slots, state);
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      if (!collectReactiveScalarChildSource(child, slots, state)) {
        return false;
      }
    }
    return true;
  }

  if (children === null || children === undefined || children === false) {
    return true;
  }

  if (typeof children === 'function') {
    slots.push({ kind: 'dynamic', compute: children as () => unknown });
    state.hasDynamic = true;
    return true;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    slots.push({ kind: 'static', value: String(children) });
    return true;
  }

  return false;
}

export function getReactiveScalarChildSource(
  children: unknown
): ReactiveScalarChildSource | null {
  const slots: ReactiveScalarChildSource = [];
  const state = { hasDynamic: false };

  if (!collectReactiveScalarChildSource(children, slots, state)) {
    return null;
  }

  return state.hasDynamic ? slots : null;
}

export function getSingleReactiveChildBoundarySource(
  children: unknown
): (() => VNode) | null {
  if (isFragmentVNode(children)) {
    const fragmentChildren = children.props?.children ?? children.children;
    return getSingleReactiveChildBoundarySource(fragmentChildren);
  }

  if (Array.isArray(children)) {
    if (children.length !== 1) {
      return null;
    }
    return getSingleReactiveChildBoundarySource(children[0]);
  }

  if (typeof children === 'function') {
    return children as () => VNode;
  }

  return null;
}

function collectReactiveChildBoundarySequenceSource(
  children: unknown,
  slots: ReactiveChildBoundarySequenceSource,
  state: { dynamicCount: number }
): boolean {
  if (isFragmentVNode(children)) {
    const fragmentChildren = children.props?.children ?? children.children;
    return collectReactiveChildBoundarySequenceSource(
      fragmentChildren,
      slots,
      state
    );
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      if (!collectReactiveChildBoundarySequenceSource(child, slots, state)) {
        return false;
      }
    }
    return true;
  }

  if (children === null || children === undefined || children === false) {
    return true;
  }

  if (typeof children === 'function') {
    slots.push({ kind: 'dynamic', compute: children as () => VNode });
    state.dynamicCount += 1;
    return true;
  }

  if (typeof children === 'string' || typeof children === 'number') {
    slots.push({ kind: 'static-text', value: String(children) });
    return true;
  }

  if (_isDOMElement(children)) {
    slots.push({ kind: 'static-node', value: children as VNode });
    return true;
  }

  return false;
}

export function getReactiveChildBoundarySequenceSource(
  children: unknown
): ReactiveChildBoundarySequenceSource | null {
  const slots: ReactiveChildBoundarySequenceSource = [];
  const state = { dynamicCount: 0 };

  if (!collectReactiveChildBoundarySequenceSource(children, slots, state)) {
    return null;
  }

  return state.dynamicCount >= 1 && slots.length > 1 ? slots : null;
}

export function areReactiveChildBoundarySequenceSourcesEqual(
  previousSource: unknown,
  nextSource: ReactiveChildBoundarySequenceSource
): boolean {
  if (
    !Array.isArray(previousSource) ||
    previousSource.length !== nextSource.length
  ) {
    return false;
  }

  for (let index = 0; index < nextSource.length; index += 1) {
    const previousSlot = previousSource[index] as
      | ReactiveChildBoundarySequenceSource[number]
      | undefined;
    const nextSlot = nextSource[index];

    if (!previousSlot || previousSlot.kind !== nextSlot.kind) {
      return false;
    }

    if (nextSlot.kind === 'static-text') {
      if (
        previousSlot.kind !== 'static-text' ||
        previousSlot.value !== nextSlot.value
      ) {
        return false;
      }
      continue;
    }

    if (nextSlot.kind === 'static-node') {
      if (
        previousSlot.kind !== 'static-node' ||
        previousSlot.value !== nextSlot.value
      ) {
        return false;
      }
      continue;
    }

    if (
      previousSlot.kind !== 'dynamic' ||
      previousSlot.compute !== nextSlot.compute
    ) {
      return false;
    }
  }

  return true;
}

export function canUpdateReactiveChildBoundarySequenceSource(
  previousSource: unknown,
  nextSource: ReactiveChildBoundarySequenceSource
): boolean {
  if (
    !Array.isArray(previousSource) ||
    previousSource.length !== nextSource.length
  ) {
    return false;
  }

  for (let index = 0; index < nextSource.length; index += 1) {
    const previousSlot = previousSource[index] as
      | ReactiveChildBoundarySequenceSource[number]
      | undefined;
    const nextSlot = nextSource[index];

    if (!previousSlot || previousSlot.kind !== nextSlot.kind) {
      return false;
    }

    if (nextSlot.kind === 'static-text') {
      if (
        previousSlot.kind !== 'static-text' ||
        previousSlot.value !== nextSlot.value
      ) {
        return false;
      }
      continue;
    }

    if (nextSlot.kind === 'static-node') {
      if (
        previousSlot.kind !== 'static-node' ||
        previousSlot.value !== nextSlot.value
      ) {
        return false;
      }
    }
  }

  return true;
}

export function areReactiveScalarChildSourcesEqual(
  previousSource: unknown,
  nextSource: ReactiveScalarChildSource
): boolean {
  if (
    !Array.isArray(previousSource) ||
    previousSource.length !== nextSource.length
  ) {
    return false;
  }

  for (let index = 0; index < nextSource.length; index += 1) {
    const previousSlot = previousSource[index] as
      | ReactiveScalarChildSourceSlot
      | undefined;
    const nextSlot = nextSource[index];

    if (!previousSlot || previousSlot.kind !== nextSlot.kind) {
      return false;
    }

    if (nextSlot.kind === 'static') {
      if (
        previousSlot.kind !== 'static' ||
        previousSlot.value !== nextSlot.value
      ) {
        return false;
      }
      continue;
    }

    if (
      previousSlot.kind !== 'dynamic' ||
      previousSlot.compute !== nextSlot.compute
    ) {
      return false;
    }
  }

  return true;
}

export function normalizeReactiveScalarSequenceValues(
  values: unknown[]
): string[] | null {
  const normalized: string[] = [];

  for (const value of values) {
    if (!collectReactiveScalarSequenceValue(value, normalized)) {
      return null;
    }
  }

  return normalized;
}

export function normalizeOwnedReactiveTextValue(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return null;
}

export function collectReactiveChildValuesAsVNodes(
  values: unknown[],
  children: VNode[]
): void {
  for (const value of values) {
    collectReactiveChildBoundaryVNodes(value, children);
  }
}

export function normalizeReactiveChildBoundaryVNode(value: VNode): VNode {
  if (!isFragmentVNode(value)) {
    return value;
  }

  const children = normalizeComponentChildren(value);
  if (children.length !== 1) {
    return value;
  }

  return normalizeReactiveChildBoundaryVNode(children[0] as VNode);
}

export function isSingleRootReactiveChildBoundaryValue(
  value: unknown
): boolean {
  if (value === null || value === undefined || value === false) {
    return true;
  }

  if (Array.isArray(value)) {
    return (
      value.length === 1 && isSingleRootReactiveChildBoundaryValue(value[0])
    );
  }

  if (isFragmentVNode(value)) {
    const children = normalizeComponentChildren(value);
    return (
      children.length === 1 &&
      isSingleRootReactiveChildBoundaryValue(children[0])
    );
  }

  return true;
}

export function collectReactiveChildBoundaryVNodes(
  value: unknown,
  children: VNode[]
): void {
  if (value === null || value === undefined || value === false) {
    return;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      collectReactiveChildBoundaryVNodes(child, children);
    }
    return;
  }

  if (isFragmentVNode(value)) {
    const fragmentChildren = value.props?.children ?? value.children;
    collectReactiveChildBoundaryVNodes(fragmentChildren, children);
    return;
  }

  children.push(value as VNode);
}
