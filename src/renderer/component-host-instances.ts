import { ROUTE_ROOT_COMPONENT } from '../common/router-internal';
import type { Props } from '../common/props';
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

let fallbackComponentInstanceId = 0;

export function nextComponentInstanceId(): string {
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

export function findHostInstanceByType(
  host: InstanceHostElement,
  type: (props: Props) => unknown
): ComponentInstance | null {
  const instances = host.__ASKR_INSTANCES;
  if (instances && instances.length > 0) {
    for (let index = instances.length - 1; index >= 0; index -= 1) {
      const instance = instances[index]!;
      if (instance.fn === type) {
        return instance;
      }
    }
  }

  return host.__ASKR_INSTANCE?.fn === type ? host.__ASKR_INSTANCE : null;
}
