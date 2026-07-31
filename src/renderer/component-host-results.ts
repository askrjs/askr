import { isSSRPortalHydrationAnchor } from '../common/portal';
import {
  enterDomCommitScope,
  mountInstanceInline,
  restoreDomCommitScope,
  type ComponentInstance,
} from '../runtime';
import { isTransparentComponentResult } from './child-shape';
import { markHydrationHostAdopted } from './intrinsic-hydration-adoption';
import { pruneComponentHostInstances } from './component-host-cleanup';
import {
  getRendererDOMHost,
  type InstanceHostElement,
  type InstanceHostNode,
} from './dom-host';
import { createDetachedRange } from './dom-range';

export function retainReplacementOwnerChain(
  host: Node,
  owner: ComponentInstance,
  retainedInstances: Iterable<ComponentInstance>
): void {
  pruneComponentHostInstances(
    host as InstanceHostNode,
    new Set([owner, ...retainedInstances])
  );
}

export function adoptEmptySSRPortalHydrationHost(
  host: InstanceHostNode,
  instance: ComponentInstance,
  retainedInstances: Iterable<ComponentInstance>,
  result: unknown
): boolean {
  if (
    !isSSRPortalHydrationAnchor(host) ||
    (result !== null && result !== undefined && result !== false)
  ) {
    return false;
  }
  const instanceHost = host as InstanceHostNode;
  instanceHost.__ASKR_INSTANCE = instance;
  instanceHost.__ASKR_INSTANCES = Array.from(
    new Set<ComponentInstance>([instance, ...retainedInstances])
  );
  instance._placeholder = instanceHost as Comment;
  mountInstanceInline(instance, null);
  markHydrationHostAdopted(instanceHost);
  return true;
}

export function materializeEmptyHydrationPlaceholder(
  existingHost: InstanceHostNode,
  instance: ComponentInstance,
  retainedInstances: Iterable<ComponentInstance>,
  result: unknown,
  preserveHydrationCursor: boolean
): Comment | null {
  if (
    (!preserveHydrationCursor && !isSSRPortalHydrationAnchor(existingHost)) ||
    (result !== null && result !== undefined && result !== false)
  ) {
    return null;
  }
  const placeholder = isSSRPortalHydrationAnchor(existingHost)
    ? existingHost
    : (existingHost.ownerDocument ?? document).createComment('');
  if (placeholder !== existingHost) {
    existingHost.parentNode?.insertBefore(placeholder, existingHost);
  }
  const host = placeholder as InstanceHostNode;
  host.__ASKR_INSTANCE = instance;
  host.__ASKR_INSTANCES = [instance];
  instance._placeholder = placeholder;
  mountInstanceInline(instance, null);
  return placeholder;
}

export function itemInstanceHydrationComplete(host: InstanceHostElement): void {
  const instance = host.__ASKR_INSTANCE;
  const scope = (
    instance as unknown as
      | { scope?: { hydrationPending?: boolean } }
      | undefined
  )?.scope;
  if (scope) {
    scope.hydrationPending = false;
  }
}

export function materializeComponentResultNode(
  childInstance: ComponentInstance,
  result: unknown,
  parentNamespace?: string
): Node {
  const previousInstance = enterDomCommitScope(childInstance);
  let dom: Node | null;
  try {
    dom = getRendererDOMHost().createComponentResultNode(
      childInstance.fn,
      result,
      parentNamespace
    );
  } finally {
    restoreDomCommitScope(previousInstance);
  }
  if (dom instanceof Element) {
    mountInstanceInline(childInstance, dom);
    return dom;
  }
  if (!dom) {
    const placeholder = document.createComment('');
    try {
      const host = placeholder as InstanceHostNode;
      host.__ASKR_INSTANCE = childInstance;
      host.__ASKR_INSTANCES = [childInstance];
    } catch {
      // Ignore placeholder metadata failures.
    }
    childInstance._placeholder = placeholder;
    mountInstanceInline(childInstance, null);
    return placeholder;
  }
  if (dom instanceof Comment) {
    const host = dom as InstanceHostNode;
    const instances = host.__ASKR_INSTANCES ?? [];
    if (!instances.includes(childInstance)) {
      instances.push(childInstance);
    }
    host.__ASKR_INSTANCES = instances;
    host.__ASKR_INSTANCE = instances[0] ?? childInstance;
    childInstance._placeholder = dom;
    mountInstanceInline(childInstance, null);
    return dom;
  }
  if (!isTransparentComponentResult(result)) {
    const host = document.createElement('div') as InstanceHostElement;
    host.appendChild(dom);
    host.__ASKR_WRAPPER_HOST = true;
    mountInstanceInline(childInstance, host);
    return host;
  }
  const materialized = createDetachedRange(dom, childInstance, true);
  const host = materialized.range.start as InstanceHostNode;
  const instances = host.__ASKR_INSTANCES ?? [];
  if (!instances.includes(childInstance)) {
    instances.push(childInstance);
  }
  host.__ASKR_INSTANCE = childInstance;
  host.__ASKR_INSTANCES = instances;
  childInstance._placeholder = host as Comment;
  mountInstanceInline(childInstance, null);
  return materialized.fragment ?? host;
}
