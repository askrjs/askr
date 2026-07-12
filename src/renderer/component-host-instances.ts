import { ROUTE_ROOT_COMPONENT } from '../common/router-internal';
import type { Props } from '../common/props';
import { isProductionEnvironment } from '../common/env';
import { getCurrentInstance, type ComponentInstance } from '../runtime';
import { getDevValue, incDevCounter } from '../runtime';
import type { InstanceHostElement } from './dom-host';
import type { DOMElement } from './types';
import { extractKey } from './utils';

export function isRouteRootComponentVNode(node: unknown): boolean {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { [ROUTE_ROOT_COMPONENT]?: boolean })[ROUTE_ROOT_COMPONENT] ===
      true
  );
}

export function inheritComponentCleanupStrict(
  instance: ComponentInstance
): void {
  const owner = getCurrentInstance();
  if (owner) {
    instance.cleanupStrict = owner.cleanupStrict;
  }
}

const vnodeComponentInstances = new WeakMap<object, ComponentInstance>();

export function getVNodeComponentInstance(
  node: unknown
): ComponentInstance | undefined {
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }

  return (
    vnodeComponentInstances.get(node) ??
    (node as { __instance?: ComponentInstance }).__instance
  );
}

export function setVNodeComponentInstance(
  node: unknown,
  instance: ComponentInstance
): void {
  if (typeof node !== 'object' || node === null) {
    return;
  }

  const objectNode = node as { __instance?: ComponentInstance };
  vnodeComponentInstances.delete(objectNode);

  if (Object.prototype.hasOwnProperty.call(objectNode, '__instance')) {
    try {
      objectNode.__instance = instance;
      return;
    } catch {
      // Fall back to WeakMap for readonly vnode metadata.
    }
  }

  if (Object.isExtensible(objectNode)) {
    try {
      objectNode.__instance = instance;
      return;
    } catch {
      // Fall back to WeakMap for frozen/proxied objects.
    }
  }

  vnodeComponentInstances.set(objectNode, instance);
}

/** @internal Restore component ownership after provisional creation fails. */
export function restoreVNodeComponentInstance(
  node: unknown,
  instance: ComponentInstance | undefined
): void {
  if (typeof node !== 'object' || node === null) {
    return;
  }

  const objectNode = node as { __instance?: ComponentInstance };
  vnodeComponentInstances.delete(objectNode);

  if (instance) {
    setVNodeComponentInstance(objectNode, instance);
    return;
  }

  try {
    delete objectNode.__instance;
  } catch {
    try {
      objectNode.__instance = undefined;
    } catch {
      // Frozen/proxied vnodes have no mutable metadata to clear.
    }
  }
}

let fallbackComponentInstanceId = 0;
const PRODUCTION_BUILD_ENABLED = isProductionEnvironment();

export function nextComponentInstanceId(): string {
  if (PRODUCTION_BUILD_ENABLED || isProductionEnvironment()) {
    fallbackComponentInstanceId++;
    return `comp-${fallbackComponentInstanceId}`;
  }

  const key = '__COMPONENT_INSTANCE_ID';
  try {
    incDevCounter(key);
    const n = getDevValue<number>(key);
    if (typeof n === 'number' && Number.isFinite(n)) return `comp-${n}`;
  } catch {
    // Fall through to local counter
  }
  fallbackComponentInstanceId++;
  return `comp-${fallbackComponentInstanceId}`;
}

export function inheritComponentKey(
  target: DOMElement,
  source: DOMElement
): DOMElement {
  const inheritedKey = extractKey(source);
  if (inheritedKey === undefined || extractKey(target) !== undefined) {
    return target;
  }

  target.key = inheritedKey;

  if (typeof target.type === 'string') {
    if (!target.props) {
      target.props = {};
    }

    const props = target.props as Record<string, unknown>;
    if (props['data-key'] === undefined) {
      props['data-key'] = String(inheritedKey);
    }
    if (props['data-askr-key-kind'] === undefined) {
      props['data-askr-key-kind'] = typeof inheritedKey;
    }
  }

  return target;
}

export function setComponentOwnershipIdentity(
  instance: ComponentInstance,
  node: unknown,
  parent: ComponentInstance | null,
  wrapperDepth = 0,
  position?: number
): void {
  instance._vnodeOwner =
    typeof node === 'object' && node !== null ? node : undefined;
  instance._vnodeParent = parent;
  const key = extractKey(node as DOMElement);
  if (key === undefined) {
    delete instance._vnodeKey;
  } else {
    instance._vnodeKey = key;
  }
  instance._vnodePosition = position;
  instance._wrapperDepth = wrapperDepth;
}

export function findHostInstanceByType(
  host: InstanceHostElement,
  type: (props: Props) => unknown,
  node?: unknown,
  parent?: ComponentInstance | null,
  wrapperDepth?: number
): ComponentInstance | null {
  const instances = host.__ASKR_INSTANCES;
  if (instances && instances.length > 0) {
    const vnodeOwner = getVNodeComponentInstance(node);
    if (
      vnodeOwner &&
      vnodeOwner.fn === type &&
      instances.includes(vnodeOwner)
    ) {
      return vnodeOwner;
    }

    const key = extractKey(node as DOMElement);
    const identityMatches = instances.filter((instance) => {
      if (instance.fn !== type) return false;
      if (parent !== undefined && instance._vnodeParent !== parent) {
        return false;
      }
      if (key !== undefined && instance._vnodeKey !== key) return false;
      if (
        wrapperDepth !== undefined &&
        instance._wrapperDepth !== wrapperDepth
      ) {
        return false;
      }
      return true;
    });
    if (identityMatches.length === 1) {
      return identityMatches[0]!;
    }
    if (identityMatches.length > 1 && key !== undefined) {
      return identityMatches[identityMatches.length - 1]!;
    }

    // A single unannotated owner is safe for legacy hydration hosts. Do not
    // fall back to type-only reuse when a wrapper chain has several owners.
    const sameType = instances.filter((instance) => instance.fn === type);
    if (sameType.length === 1) {
      return sameType[0]!;
    }
    return null;
  }

  if (host.__ASKR_INSTANCE?.fn === type) {
    const instance = host.__ASKR_INSTANCE;
    const key = extractKey(node as DOMElement);
    if (
      (parent === undefined || instance._vnodeParent === parent) &&
      (key === undefined || instance._vnodeKey === key) &&
      (wrapperDepth === undefined || instance._wrapperDepth === wrapperDepth)
    ) {
      return instance;
    }
    if (
      node === undefined &&
      parent === undefined &&
      wrapperDepth === undefined
    ) {
      return instance;
    }
  }

  return null;
}
