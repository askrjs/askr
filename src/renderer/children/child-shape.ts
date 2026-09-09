import { isFragmentType, STATIC_CHILDREN } from '../../common/jsx';
import { __CONTROL_BOUNDARY__ } from '../../common/vnode';
import { hasTransparentComponentResult } from '../../common/control';
import { logger } from '../../common/logger';
import { getCurrentComponentInstance } from '../../runtime';
import { getRuntimeEnv } from '../env';
import { _isDOMElement, type DOMElement } from '../types';
import { isSkippedProp, parseEventName } from '../utils';

export type StaticCreateChildShape = {
  textContent: string | null;
};

/**
 * The kinds of value a child list can hold.
 *
 * Child classification used to be answered ad hoc: `isEmptyChild` was private
 * to element-children.ts, the scalar test was written out at every site, and
 * "is this a component" was `_isDOMElement(c) && typeof c.type === 'function'`
 * repeated by hand. Naming the kinds keeps the answers in one place and lets a
 * caller collect them in a single pass.
 */

/** A child that renders nothing. `0` and `''` are values, and do render. */
export function isEmptyChild(child: unknown): boolean {
  return child === null || child === undefined || child === false;
}

/** A child that renders as text. */
export function isScalarChild(child: unknown): child is string | number {
  return typeof child === 'string' || typeof child === 'number';
}

/** A vnode whose type is a component function rather than a tag name. */
export function isComponentChild(child: unknown): child is DOMElement {
  return (
    _isDOMElement(child) && typeof (child as DOMElement).type === 'function'
  );
}

/** Which kinds a child list contains. `element` covers intrinsics and components. */
export interface ChildKinds {
  empty: boolean;
  scalar: boolean;
  element: boolean;
  component: boolean;
}

/** Collect {@link ChildKinds} in one pass rather than one scan per question. */
export function collectChildKinds(children: readonly unknown[]): ChildKinds {
  const kinds: ChildKinds = {
    empty: false,
    scalar: false,
    element: false,
    component: false,
  };
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (isEmptyChild(child)) {
      kinds.empty = true;
    } else if (isScalarChild(child)) {
      kinds.scalar = true;
    } else if (_isDOMElement(child)) {
      kinds.element = true;
      if (typeof (child as DOMElement).type === 'function') {
        kinds.component = true;
      }
    }
  }
  return kinds;
}

export function isFragmentVNode(node: unknown): node is DOMElement {
  return _isDOMElement(node) && isFragmentType((node as DOMElement).type);
}

export function isTransparentComponentResult(result: unknown): boolean {
  return (
    Array.isArray(result) ||
    (_isDOMElement(result) &&
      ((result as DOMElement).type === __CONTROL_BOUNDARY__ ||
        hasTransparentComponentResult((result as DOMElement).type) ||
        isFragmentVNode(result)))
  );
}

export function isTransparentComponentRangeResult(result: unknown): boolean {
  return Array.isArray(result) || isFragmentVNode(result);
}

export function normalizeComponentChildren(result: unknown): unknown[] {
  if (result === null || result === undefined || result === false) {
    return [];
  }

  if (Array.isArray(result)) {
    const children: unknown[] = [];
    for (const child of result) {
      children.push(...normalizeComponentChildren(child));
    }
    return children;
  }

  if (isFragmentVNode(result)) {
    const children = result.props?.children ?? result.children ?? [];
    return normalizeComponentChildren(children);
  }

  return [result];
}

function warnMissingKeys(children: unknown[]): void {
  if (getRuntimeEnv().NODE_ENV === 'production') return;

  let elementCount = 0;
  let hasKeys = false;

  for (const item of children) {
    if (typeof item === 'object' && item !== null && 'type' in item) {
      if ((item as DOMElement).type === __CONTROL_BOUNDARY__) continue;
      elementCount += 1;
      const rawKey =
        (item as DOMElement).key ??
        ((item as DOMElement).props as Record<string, unknown> | undefined)
          ?.key;
      if (rawKey !== undefined) {
        hasKeys = true;
        break;
      }
    }
  }

  if (elementCount > 1 && !hasKeys) {
    const inst = getCurrentComponentInstance();
    const warnings = inst ? (inst.devWarningsEmitted ??= new Set()) : null;
    if (warnings?.has('missing-keys')) return;
    warnings?.add('missing-keys');
    try {
      const name = inst?.fn?.name || '<anonymous>';
      logger.warn(
        `Missing keys on dynamic lists in ${name}. Each child in a list should have a unique "key" prop.`
      );
    } catch {
      logger.warn(
        'Missing keys on dynamic lists. Each child in a list should have a unique "key" prop.'
      );
    }
  }
}

function hasStaticChildrenMarker(children: unknown[]): boolean {
  return (
    (
      children as unknown as {
        [STATIC_CHILDREN]?: boolean;
      }
    )[STATIC_CHILDREN] === true
  );
}

export function maybeWarnMissingKeys(children: unknown[]): void {
  if (!hasStaticChildrenMarker(children)) {
    warnMissingKeys(children);
  }
}

function tryGetStaticCreateChildShape(
  children: unknown
): StaticCreateChildShape | null {
  if (children === null || children === undefined || children === false) {
    return { textContent: null };
  }

  if (typeof children === 'string' || typeof children === 'number') {
    return { textContent: String(children) };
  }

  if (Array.isArray(children) && children.length === 1) {
    const child = children[0];
    if (child === null || child === undefined || child === false) {
      return { textContent: null };
    }
    if (typeof child === 'string' || typeof child === 'number') {
      return { textContent: String(child) };
    }
  }

  return null;
}

function isStaticCreateScalarValue(value: unknown): boolean {
  const valueType = typeof value;
  return (
    valueType === 'string' || valueType === 'number' || valueType === 'boolean'
  );
}

export function tryGetStaticCreateFastPathShape(
  props: Record<string, unknown>,
  children: unknown
): StaticCreateChildShape | null {
  const childShape = tryGetStaticCreateChildShape(children);
  if (!childShape) {
    return null;
  }

  for (const key in props) {
    if (key === 'ref') {
      return null;
    }
    if (isSkippedProp(key)) {
      continue;
    }

    const value = props[key];
    if (value === undefined || value === null || value === false) {
      continue;
    }

    if (parseEventName(key) || !isStaticCreateScalarValue(value)) {
      return null;
    }
  }

  return childShape;
}
