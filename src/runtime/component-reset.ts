import type { ComponentInstance } from './component-internal';

/** Pending work belongs to one generation and cannot survive its retirement. */
export function resetComponentWork(instance: ComponentInstance): void {
  instance.hasPendingUpdate = false;
  instance.notifyUpdate = null;
  instance.mountOperations = undefined;
  instance.commitOperations = undefined;
  instance.lifecycleSlots = undefined;
  instance._pendingReadSources = undefined;
  instance._pendingReadSourceVersions = undefined;
  instance._placeholder = undefined;
}
