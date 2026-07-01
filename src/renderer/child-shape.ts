import { STATIC_CHILDREN } from '../common/jsx';
import { __FOR_BOUNDARY__ } from '../common/vnode';
import { logger } from '../dev/logger';
import { Fragment } from '../jsx/jsx-runtime';
import { getCurrentInstance } from '../runtime/component-contracts';
import { getRuntimeEnv } from './env';
import { _isDOMElement, type DOMElement } from './types';
import { isSkippedProp, parseEventName } from './utils';

export type StaticCreateChildShape = {
  textContent: string | null;
};

export function isFragmentVNode(node: unknown): node is DOMElement {
  return (
    _isDOMElement(node) &&
    typeof (node as DOMElement).type === 'symbol' &&
    ((node as DOMElement).type === Fragment ||
      String((node as DOMElement).type) === 'Symbol(askr.fragment)')
  );
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

  let hasElements = false;
  let hasKeys = false;

  for (const item of children) {
    if (typeof item === 'object' && item !== null && 'type' in item) {
      if ((item as DOMElement).type === __FOR_BOUNDARY__) continue;
      hasElements = true;
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

  if (hasElements && !hasKeys) {
    const inst = getCurrentInstance();
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
