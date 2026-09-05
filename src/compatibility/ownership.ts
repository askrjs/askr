import {
  componentRecordPrototype,
  OwnershipRecord,
  getOwnedChildScopes,
  setOwnedChildScopes,
} from '../runtime/ownership';
import type { ComponentInstance as ExecutionRecord } from '../runtime/component-internal';
import type { RuntimeRendererHost } from './contracts/core';
import { bindComponentOwnership } from '../runtime/component-cleanup';

type ComponentInstance = NonNullable<
  Parameters<RuntimeRendererHost['evaluate']>[3]
>;

const fields = {
  mounted: 'mounted',
  abortController: 'controller',
  cleanupFns: 'cleanups',
  _lastReadSources: 'reads',
  _ownershipGeneration: 'identity',
} as const;

const descriptors: PropertyDescriptorMap = {};
for (const [field, member] of Object.entries(fields)) {
  descriptors[field] = {
    enumerable: true,
    configurable: true,
    get(this: ExecutionRecord) {
      return this.owner[member];
    },
    set(this: ExecutionRecord, value: never) {
      this.owner[member] = value;
    },
  };
}
descriptors._ownedChildScopes = {
  enumerable: true,
  configurable: true,
  get(this: ExecutionRecord) {
    return getOwnedChildScopes(this.owner);
  },
  set(
    this: ExecutionRecord,
    scopes: Set<import('../runtime/ownership').OwnedChildScope> | undefined
  ) {
    setOwnedChildScopes(this.owner, scopes);
  },
};
export function installOwnershipViews(): void {
  Object.defineProperties(componentRecordPrototype, descriptors);
}

const exposed = new WeakSet<object>();

/** Preserve the object identity used by host callbacks and readable maps.
 * Legacy properties are views of the same record, never copied lifetime state. */
export function componentView(instance: ExecutionRecord): ComponentInstance {
  if (!exposed.has(instance)) {
    Object.defineProperties(instance, descriptors);
    exposed.add(instance);
  }
  return instance as unknown as ComponentInstance;
}

/** Adopt a consumer-created extension record in place, preserving identity. */
export function executionRecord(instance: ComponentInstance): ExecutionRecord {
  const record = instance as unknown as ExecutionRecord;
  if (!record.owner) {
    const owner = new OwnershipRecord();
    owner.mounted = instance.mounted;
    owner.controller = instance.abortController;
    owner.cleanups = instance.cleanupFns;
    setOwnedChildScopes(owner, instance._ownedChildScopes);
    owner.reads =
      instance._lastReadSources as unknown as OwnershipRecord['reads'];
    owner.identity = instance._ownershipGeneration;
    record.owner = owner;
    bindComponentOwnership(record);
    componentView(record);
  }
  return record;
}
