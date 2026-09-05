import { isDevelopmentEnvironment } from '../common/env';
import { logger } from '../common/logger';
import type { ComponentInstance } from '../runtime';
import type { InstanceHostNode } from './dom-host';
import { clearRangeHostOwner, indexRangeHostOwner } from './dom-range';

/** Publish a replacement binding and its lookup index together. */
export function bindComponentHost(
  instance: ComponentInstance,
  target: Element | null,
  placeholder?: Comment
): void {
  instance.target = target;
  instance._placeholder = placeholder;
  const host = target ?? placeholder;
  if (host && !instance.ownership.disposed) indexRangeHostOwner(instance, host);
}

/** The writer for component indexes exposed on host nodes. */
export function writeHostOwners(
  host: InstanceHostNode,
  instances: ComponentInstance[] | undefined,
  primary: ComponentInstance | undefined,
  hasInstances = instances !== undefined,
  hasPrimary = primary !== undefined,
  retainedPrefix = 0
): void {
  const previousInstances = host.__ASKR_INSTANCES;
  const previousPrimary = host.__ASKR_INSTANCE;
  if (hasInstances) host.__ASKR_INSTANCES = instances;
  else delete host.__ASKR_INSTANCES;
  if (hasPrimary) host.__ASKR_INSTANCE = primary;
  else delete host.__ASKR_INSTANCE;
  for (
    let index = retainedPrefix;
    index < (previousInstances?.length ?? 0);
    index++
  ) {
    const previous = previousInstances![index]!;
    if (previous !== primary && !instances?.includes(previous))
      clearRangeHostOwner(previous, host);
  }
  if (
    previousPrimary &&
    previousPrimary !== primary &&
    !instances?.includes(previousPrimary)
  )
    clearRangeHostOwner(previousPrimary, host);
  for (let index = retainedPrefix; index < (instances?.length ?? 0); index++)
    indexBoundHost(instances![index]!, host);
  if (primary && primary !== previousPrimary) indexBoundHost(primary, host);
}

function indexBoundHost(owner: ComponentInstance, host: Node): void {
  if (owner.ownership.disposed) return;
  // A pending pruning transaction can still publish metadata on the source
  // host after hydration has moved the component to its range anchors.
  const bound = owner.target ?? owner._placeholder;
  if (!bound || bound === host) indexRangeHostOwner(owner, host);
}

export function clearHostOwners(
  host: InstanceHostNode,
  onError: (error: unknown) => void
): void {
  for (const owner of host.__ASKR_INSTANCES ?? [])
    clearRangeHostOwner(owner, host);
  if (host.__ASKR_INSTANCE) clearRangeHostOwner(host.__ASKR_INSTANCE, host);
  for (const property of ['__ASKR_INSTANCE', '__ASKR_INSTANCES'] as const) {
    try {
      delete host[property];
    } catch (error) {
      onError(error);
    }
  }
}

export function recordInlineComponentHost(
  instance: ComponentInstance,
  target: Element | null
): void {
  instance.target = target;
  if (!target && instance._placeholder)
    indexRangeHostOwner(instance, instance._placeholder);
  // Record backref on host element so renderer can clean up when the
  // node is removed. Avoids leaks if the node is detached or replaced.
  try {
    if (typeof Element !== 'undefined' && target instanceof Element) {
      const host = target as Element & {
        __ASKR_INSTANCE?: ComponentInstance;
        __ASKR_INSTANCES?: ComponentInstance[];
      };
      const instances = host.__ASKR_INSTANCES;
      if (!instances) {
        writeHostOwners(host, [instance], instance);
      } else if (instances[instances.length - 1] !== instance) {
        const existingIndex = instances.indexOf(instance);
        const nextInstances =
          existingIndex === -1
            ? instances.slice()
            : instances.filter((entry) => entry !== instance);
        nextInstances.push(instance);
        writeHostOwners(
          host,
          nextInstances,
          nextInstances[0] ?? instance,
          true,
          true,
          existingIndex === -1 ? instances.length : 0
        );
      }
    }
  } catch (err) {
    if (isDevelopmentEnvironment()) {
      const componentName = instance.fn.name || instance.id;
      let hostName = 'unknown';
      try {
        hostName = target?.tagName?.toLowerCase() || hostName;
      } catch {
        // Keep the original bookkeeping failure as the useful diagnostic.
      }
      logger.warn(
        `[askr] Failed to record DOM ownership for ${componentName} on <${hostName}>.`,
        err
      );
    }
  }
}
