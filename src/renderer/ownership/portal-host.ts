import {
  cleanupComponent,
  getRuntimeCleanup,
  type ComponentInstance,
} from '../../runtime';
import type { InstanceHostNode } from '../dom-host';
import { bindComponentHost, writeHostOwners } from './nodes';

export function detachPortalHostOutput(host: ComponentInstance): void {
  const target = host?.target;
  const parent = target?.parentNode;
  if (!host || !target || !parent) {
    return;
  }

  const portalHost = target as InstanceHostNode;
  const hostedInstances = new Set<ComponentInstance>(
    portalHost.__ASKR_INSTANCES ?? []
  );
  if (portalHost.__ASKR_INSTANCE) {
    hostedInstances.add(portalHost.__ASKR_INSTANCE);
  }

  for (const instance of hostedInstances) {
    if (instance !== host) {
      cleanupComponent(instance);
    }
  }

  try {
    writeHostOwners(portalHost, undefined, undefined);
    delete portalHost.__ASKR_WRAPPER_HOST;
  } catch {
    // Host metadata is best-effort on non-extensible DOM shims.
  }

  getRuntimeCleanup().teardownNodeSubtree(target);

  const placeholder = target.ownerDocument.createComment('');
  writeHostOwners(placeholder as InstanceHostNode, undefined, host);
  parent.replaceChild(placeholder, target);
  bindComponentHost(host, null, placeholder);
}

export function isComponentHostDetached(instance: ComponentInstance): boolean {
  return instance.target?.isConnected === false;
}
