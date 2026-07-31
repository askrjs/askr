import { ROUTE_ROOT_COMPONENT } from '../common/router-internal';
import type { Props } from '../common/props';
import { isProductionEnvironment } from '../common/env';
import { getCurrentInstance, type ComponentInstance } from '../runtime';
import { getDevValue, incDevCounter } from '../runtime';
import { getOwnedRange, RANGE_START_MARKER } from './dom-range';
import type { InstanceHostNode } from './dom-host';
import type { DOMElement } from './types';
import { extractKey } from './utils';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

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
const PRODUCTION_BUILD_ENABLED = !__ASKR_DEVELOPMENT_BUILD__;

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

function extractComponentIdentityKey(
  node: unknown
): string | number | undefined {
  const publicKey = extractKey(node);
  if (publicKey !== undefined) {
    return publicKey;
  }
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }
  const internalKey = (
    (node as DOMElement).props as Record<string, unknown> | undefined
  )?.['__askrIdentityKey'];
  if (internalKey === undefined || internalKey === null) {
    return undefined;
  }
  return typeof internalKey === 'symbol'
    ? String(internalKey)
    : (internalKey as string | number);
}

export function hasComponentOwnershipIdentity(
  instance: ComponentInstance,
  type: (props: Props) => unknown,
  node: unknown,
  parent: ComponentInstance | null,
  wrapperDepth: number,
  position?: number
): boolean {
  return (
    instance.fn === type &&
    instance._vnodeParent === parent &&
    instance._vnodeParentGeneration === parent?._ownershipGeneration &&
    instance._vnodeKey === extractComponentIdentityKey(node) &&
    instance._wrapperDepth === wrapperDepth &&
    instance._vnodePosition === position
  );
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
  instance._vnodeParentGeneration = parent?._ownershipGeneration;
  const key = extractComponentIdentityKey(node as DOMElement);
  if (key === undefined) {
    delete instance._vnodeKey;
  } else {
    instance._vnodeKey = key;
  }
  instance._vnodePosition = position;
  instance._wrapperDepth = wrapperDepth;
}

export function findHostInstanceByType(
  host: InstanceHostNode,
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
      (parent === undefined ||
        hasComponentOwnershipIdentity(
          vnodeOwner,
          type,
          node,
          parent,
          wrapperDepth ?? vnodeOwner._wrapperDepth ?? 0
        )) &&
      instances.includes(vnodeOwner)
    ) {
      return vnodeOwner;
    }

    const key = extractComponentIdentityKey(node as DOMElement);
    const identityMatches = instances.filter((instance) => {
      if (instance.fn !== type) return false;
      if (parent !== undefined && instance._vnodeParent !== parent) {
        return false;
      }
      if (
        parent !== undefined &&
        instance._vnodeParentGeneration !== parent?._ownershipGeneration
      ) {
        return false;
      }
      if (node !== undefined && instance._vnodeKey !== key) return false;
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
    const key = extractComponentIdentityKey(node as DOMElement);
    if (
      (parent === undefined || instance._vnodeParent === parent) &&
      (parent === undefined ||
        instance._vnodeParentGeneration === parent?._ownershipGeneration) &&
      (node === undefined || instance._vnodeKey === key) &&
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

/**
 * Resolve an instance on a comment host only when the vnode carries durable
 * identity. An unkeyed multi-node range can also move through transparent
 * wrapper owners while its recorded owner generation remains live. Fresh
 * unkeyed null components still supersede the old generation.
 */
export function findStableHostInstanceByType(
  host: InstanceHostNode,
  type: (props: Props) => unknown,
  node: unknown,
  parent: ComponentInstance | null,
  wrapperDepth: number
): ComponentInstance | null {
  const instances = new Set(host.__ASKR_INSTANCES ?? []);
  if (host.__ASKR_INSTANCE) instances.add(host.__ASKR_INSTANCE);

  const parentGeneration = parent?._ownershipGeneration;

  const vnodeOwner = getVNodeComponentInstance(node);
  if (
    vnodeOwner?.fn === type &&
    instances.has(vnodeOwner) &&
    vnodeOwner._vnodeParent === parent &&
    vnodeOwner._vnodeParentGeneration === parentGeneration
  ) {
    return vnodeOwner;
  }

  const key = extractComponentIdentityKey(node as DOMElement);
  if (key === undefined) {
    const rangeMatches = Array.from(instances).filter((instance) => {
      const range = getOwnedRange(instance);
      const exactParent =
        instance._vnodeParent === parent &&
        instance._vnodeParentGeneration === parentGeneration;
      return (
        instance.fn === type &&
        (exactParent ||
          (instance._vnodeParent !== parent &&
            instance._vnodeParent != null &&
            instance._vnodeParentGeneration ===
              instance._vnodeParent._ownershipGeneration)) &&
        instance._vnodeKey === undefined &&
        instance._wrapperDepth === wrapperDepth &&
        ((range?.single === false && range.start === host) ||
          (exactParent && instance._placeholder === host))
      );
    });
    return rangeMatches.length === 1 ? rangeMatches[0]! : null;
  }

  const matches = Array.from(instances).filter(
    (instance) =>
      instance.fn === type &&
      instance._vnodeParent === parent &&
      instance._vnodeParentGeneration === parentGeneration &&
      instance._vnodeKey === key &&
      instance._wrapperDepth === wrapperDepth
  );
  if (matches.length > 0) {
    return matches[matches.length - 1]!;
  }

  const rangeMatches = Array.from(instances).filter((instance) => {
    const range = getOwnedRange(instance);
    return (
      instance.fn === type &&
      instance._vnodeParent !== parent &&
      instance._vnodeParent != null &&
      instance._vnodeParentGeneration ===
        instance._vnodeParent._ownershipGeneration &&
      instance._vnodeKey === key &&
      instance._wrapperDepth === wrapperDepth &&
      ((range?.single === false && range.start === host) ||
        (host instanceof Comment &&
          host.data === RANGE_START_MARKER &&
          instance._placeholder === host))
    );
  });
  return rangeMatches.length === 1 ? rangeMatches[0]! : null;
}
