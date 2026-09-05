import {
  markReactivePropsDirtySource,
  markReadableDerivedSubscribersDirty,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from './readable';
import { type ComponentInstance } from './component-internal';

type PortalOwner = {
  instance: ComponentInstance;
  generation: object;
};

function setPortalErrorParent(
  host: ComponentInstance | null,
  owner: PortalOwner | null
): void {
  if (!host) {
    return;
  }
  if (
    owner &&
    owner.instance.owner.identity === owner.generation &&
    owner.instance.notifyUpdate !== null
  ) {
    host._portalErrorParent = owner.instance;
    host._portalErrorParentGeneration = owner.generation;
    return;
  }
  host._portalErrorParent = null;
  host._portalErrorParentGeneration = undefined;
}

function createPortalSlot<T>(): {
  read(): T | undefined;
  write(value: T | undefined, owner: PortalOwner | null): void;
  getOwner(): PortalOwner | null;
} {
  let currentValue: T | undefined;
  let currentOwner: PortalOwner | null = null;

  const source = (() => {
    recordReadableRead(source);
    return currentValue;
  }) as ReadableSource<T | undefined>;

  return {
    read() {
      return source();
    },
    write(value: T | undefined, owner: PortalOwner | null) {
      const ownerChanged =
        currentOwner?.instance !== owner?.instance ||
        currentOwner?.generation !== owner?.generation;
      currentOwner = owner;
      if (Object.is(currentValue, value) && !ownerChanged) {
        return;
      }

      currentValue = value;
      markReadableDerivedSubscribersDirty(source);
      markReactivePropsDirtySource(source);
      notifyReadableReaders(source);
    },
    getOwner() {
      return currentOwner;
    },
  };
}
export { PortalOwner, setPortalErrorParent, createPortalSlot };
