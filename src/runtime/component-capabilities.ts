import type { ComponentInstance } from './component-internal';
import { ownCleanup } from './ownership';
import { trackRouteGeneration } from './ownership-diagnostics';

/** Integrations may identify and attach to a lifetime without changing it. */
export function getComponentLifetimeIdentity(
  instance: ComponentInstance
): object {
  return instance.ownership.identity;
}

export function ownComponentCleanup(
  instance: ComponentInstance,
  cleanup: () => void
): void {
  ownCleanup(instance.ownership, cleanup);
}

export function trackComponentRouteGeneration(
  instance: ComponentInstance
): void {
  trackRouteGeneration(instance.ownership.identity);
}

export function isServerComponent(instance: ComponentInstance): boolean {
  return instance.ssr === true;
}

/** All lifecycle primitives share the execution record's single slot store. */
export function getComponentLifecycleSlot<TSlot extends { kind: string }>(
  instance: ComponentInstance,
  index: number,
  kind: TSlot['kind'],
  create: () => TSlot,
  name: string = kind
): TSlot {
  const slots = (instance.lifecycleSlots ??= []);
  const existing = slots[index] as TSlot | undefined;
  if (existing) {
    if (existing.kind !== kind)
      throw new Error(
        `${name}() lifecycle order violation: slot ${index} already belongs to ${existing.kind}(). ` +
          'Keep lifecycle primitives in a stable top-level order.'
      );
    return existing;
  }
  const slot = create();
  slots[index] = slot;
  return slot;
}
