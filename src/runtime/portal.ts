import type { RenderableChild } from '../common/vnode';
import {
  markReactivePropsDirtySource,
  markReadableDerivedSubscribersDirty,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from './readable';
import {
  cleanupComponent,
  getCurrentComponentInstance,
  getCurrentPortalScope,
  type ComponentInstance,
} from './component';
import { enqueueRuntimeTask, getRuntimeRenderer } from './access';
import {
  getCurrentLifecycleCommitBatch,
  registerLifecycleTransaction,
  type LifecycleCommitBatch,
} from './component-lifecycle';

export interface Portal<T extends RenderableChild = RenderableChild> {
  (): unknown;
  render(props: { children?: T }): unknown;
}

export interface PortalProps {
  children?: RenderableChild;
}

function createPortalSlot<T>(): {
  read(): unknown;
  write(value: T | undefined): void;
} {
  let currentValue: T | undefined;

  const source = (() => {
    recordReadableRead(source);
    return currentValue;
  }) as ReadableSource<T | undefined>;

  return {
    read() {
      return source();
    },
    write(value: T | undefined) {
      if (Object.is(currentValue, value)) {
        return;
      }

      currentValue = value;
      markReadableDerivedSubscribersDirty(source);
      markReactivePropsDirtySource(source);
      notifyReadableReaders(source);
    },
  };
}

export function definePortal<
  T extends RenderableChild = RenderableChild,
>(): Portal<T> {
  if (typeof createPortalSlot === 'function') {
    const slot = createPortalSlot<T>();

    function PortalHost() {
      return slot.read();
    }

    PortalHost.render = function PortalRender(props: { children?: T }) {
      slot.write(props.children);
      return null;
    };

    return PortalHost as Portal<T>;
  }

  let mounted = false;
  let value: T | undefined;

  function PortalHostFallback() {
    mounted = true;
    return value as unknown;
  }

  PortalHostFallback.render = function PortalRenderFallback(props: {
    children?: T;
  }) {
    if (!mounted) return null;
    value = props.children;
    return null;
  };

  return PortalHostFallback as Portal<T>;
}

type DefaultPortalState = {
  portal: Portal<RenderableChild>;
  owner: ComponentInstance | null;
  host: ComponentInstance | null;
  cleanupOwners: WeakSet<ComponentInstance>;
  explicitHostOwners: Set<ComponentInstance>;
  explicitHostCleanupOwners: WeakSet<ComponentInstance>;
  explicitHostSource: ReadableSource<number>;
};

type PendingDefaultPortalWrite = {
  state: DefaultPortalState;
  owner: ComponentInstance | null;
  children: RenderableChild | undefined;
  batch?: LifecycleCommitBatch;
};

let _defaultPortalStates = new Map<object, DefaultPortalState>();
let _hasPendingDefaultPortalValue = false;
let _pendingDefaultPortalValue: RenderableChild | undefined = undefined;
let _pendingDefaultPortalWrites = new WeakMap<
  DefaultPortalState,
  PendingDefaultPortalWrite
>();
const _batchPortalWrites = new WeakMap<
  LifecycleCommitBatch,
  Map<DefaultPortalState, PendingDefaultPortalWrite>
>();

type DefaultPortalHostProps = {
  __askrAutoDefaultPortal?: boolean;
};

function createExplicitHostSource(
  readCount: () => number
): ReadableSource<number> {
  let source: ReadableSource<number>;
  source = (() => {
    recordReadableRead(source);
    return readCount();
  }) as ReadableSource<number>;
  return source;
}

function readExplicitDefaultPortalHosts(state: DefaultPortalState): number {
  return state.explicitHostSource();
}

function notifyExplicitDefaultPortalHostReaders(
  state: DefaultPortalState
): void {
  markReadableDerivedSubscribersDirty(state.explicitHostSource);
  markReactivePropsDirtySource(state.explicitHostSource);
  notifyReadableReaders(state.explicitHostSource);
}

function createDefaultPortalState(): DefaultPortalState {
  const state: DefaultPortalState = {
    portal: definePortal<RenderableChild>(),
    owner: null,
    host: null,
    cleanupOwners: new WeakSet<ComponentInstance>(),
    explicitHostOwners: new Set<ComponentInstance>(),
    explicitHostCleanupOwners: new WeakSet<ComponentInstance>(),
    explicitHostSource: (() => 0) as ReadableSource<number>,
  };

  state.explicitHostSource = createExplicitHostSource(
    () => state.explicitHostOwners.size
  );
  return state;
}

function isExplicitHostOwnerConnected(owner: ComponentInstance): boolean {
  if (owner.target) {
    return owner.target.isConnected;
  }

  if (owner._placeholder) {
    return owner._placeholder.isConnected;
  }

  return owner.mounted;
}

export function _resetDefaultPortal(): void {
  _defaultPortalStates = new Map<object, DefaultPortalState>();
  _hasPendingDefaultPortalValue = false;
  _pendingDefaultPortalValue = undefined;
  _pendingDefaultPortalWrites = new WeakMap();
}

export function disposeDefaultPortalScope(scope: object | null): void {
  if (!scope) {
    return;
  }

  const state = _defaultPortalStates.get(scope);
  if (state) {
    state.portal.render({ children: undefined });
  }

  _defaultPortalStates.delete(scope);
}

function isComponentPortalScope(scope: object): scope is ComponentInstance {
  return Array.isArray((scope as ComponentInstance).cleanupFns);
}

type PortalHostNode = Element & {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
  __ASKR_WRAPPER_HOST?: boolean;
};

function isEmptyPortalValue(value: RenderableChild | undefined): boolean {
  return value === null || value === undefined || value === false;
}

function detachDefaultPortalHostOutput(state: DefaultPortalState): void {
  const host = state.host;
  const target = host?.target;
  const parent = target?.parentNode;
  if (!host || !target || !parent) {
    return;
  }

  const portalHost = target as PortalHostNode;
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
    delete portalHost.__ASKR_INSTANCE;
    delete portalHost.__ASKR_INSTANCES;
    delete portalHost.__ASKR_WRAPPER_HOST;
  } catch {
    // Host metadata is best-effort on non-extensible DOM shims.
  }

  getRuntimeRenderer().teardownNodeSubtree(target);

  const placeholder = document.createComment('');
  (
    placeholder as Comment & { __ASKR_INSTANCE?: ComponentInstance }
  ).__ASKR_INSTANCE = host;
  parent.replaceChild(placeholder, target);
  host.target = null;
  host._placeholder = placeholder;
}

function applyDefaultPortalWrite(
  state: DefaultPortalState,
  children: RenderableChild | undefined,
  owner: ComponentInstance | null
): void {
  state.portal.render({ children });
  state.owner = owner;
  if (isEmptyPortalValue(children)) {
    detachDefaultPortalHostOutput(state);
  }
}

function isStaleDefaultPortalScope(scope: object): boolean {
  if (!isComponentPortalScope(scope)) {
    return false;
  }

  if (scope.target && scope.target.isConnected === false) {
    return true;
  }

  return scope.mounted === false;
}

function pruneStaleDefaultPortalScopes(): void {
  if (_defaultPortalStates.size === 0) {
    return;
  }

  for (const scope of Array.from(_defaultPortalStates.keys())) {
    if (isStaleDefaultPortalScope(scope)) {
      disposeDefaultPortalScope(scope);
    }
  }
}

function getSingleDefaultPortalScope(): object | null {
  pruneStaleDefaultPortalScopes();

  if (_defaultPortalStates.size !== 1) {
    return null;
  }

  return _defaultPortalStates.keys().next().value ?? null;
}

function getDefaultPortalState(scope: object): DefaultPortalState {
  let state = _defaultPortalStates.get(scope);
  if (!state) {
    state = createDefaultPortalState();
    _defaultPortalStates.set(scope, state);
  }
  return state;
}

function resolveDefaultPortalScope(
  owner: ComponentInstance | null
): object | null {
  return (
    owner?.portalScope ??
    getCurrentPortalScope() ??
    getSingleDefaultPortalScope()
  );
}

function writeDefaultPortal(
  props: PortalProps,
  owner: ComponentInstance | null
): void {
  const scope = resolveDefaultPortalScope(owner);
  if (!scope) {
    if (_defaultPortalStates.size !== 0) {
      return;
    }

    _hasPendingDefaultPortalValue = true;
    _pendingDefaultPortalValue = props.children;
    return;
  }

  const state = getDefaultPortalState(scope);
  const batch = getCurrentLifecycleCommitBatch();
  if (batch) {
    let writes = _batchPortalWrites.get(batch);
    if (!writes) {
      writes = new Map();
      _batchPortalWrites.set(batch, writes);
    }

    const existing = writes.get(state);
    if (existing) {
      existing.owner = owner;
      existing.children = props.children;
      return;
    }

    const transaction: PendingDefaultPortalWrite = {
      state,
      owner,
      children: props.children,
      batch,
    };
    const registered = registerLifecycleTransaction(
      state,
      () => {
        if (_batchPortalWrites.get(batch)?.get(state) !== transaction) {
          return;
        }
        _batchPortalWrites.get(batch)?.delete(state);
        applyDefaultPortalWrite(state, transaction.children, transaction.owner);
      },
      () => {
        if (_batchPortalWrites.get(batch)?.get(state) === transaction) {
          _batchPortalWrites.get(batch)?.delete(state);
        }
      },
      () => {
        const parentBatch = batch.parent;
        const parentWrite = parentBatch
          ? _batchPortalWrites.get(parentBatch)?.get(state)
          : undefined;
        if (parentWrite) {
          parentWrite.owner = transaction.owner;
          parentWrite.children = transaction.children;
        }
        _batchPortalWrites.get(batch)?.delete(state);
      }
    );
    if (registered) {
      writes.set(state, transaction);
      return;
    }
  }

  const pending = _pendingDefaultPortalWrites.get(state);
  if (pending) {
    pending.owner = owner;
    pending.children = props.children;
    return;
  }

  const transaction: PendingDefaultPortalWrite = {
    state,
    owner,
    children: props.children,
  };
  if (
    registerLifecycleTransaction(
      transaction,
      () => {
        if (_pendingDefaultPortalWrites.get(state) !== transaction) {
          return;
        }

        _pendingDefaultPortalWrites.delete(state);
        _hasPendingDefaultPortalValue = false;
        _pendingDefaultPortalValue = undefined;
        applyDefaultPortalWrite(state, transaction.children, transaction.owner);
      },
      () => {
        if (_pendingDefaultPortalWrites.get(state) === transaction) {
          _pendingDefaultPortalWrites.delete(state);
        }
      }
    )
  ) {
    _pendingDefaultPortalWrites.set(state, transaction);
    return;
  }

  _hasPendingDefaultPortalValue = false;
  _pendingDefaultPortalValue = undefined;
  applyDefaultPortalWrite(state, props.children, owner);
}

function applyPendingDefaultPortalValue(scope: object): void {
  if (!_hasPendingDefaultPortalValue) {
    return;
  }

  const state = getDefaultPortalState(scope);
  state.portal.render({ children: _pendingDefaultPortalValue });
  state.owner = null;
  _hasPendingDefaultPortalValue = false;
  _pendingDefaultPortalValue = undefined;
}

function registerDefaultPortalOwner(owner: ComponentInstance): void {
  const scope = resolveDefaultPortalScope(owner);
  if (!scope) {
    return;
  }

  const state = getDefaultPortalState(scope);
  if (state.cleanupOwners.has(owner)) {
    return;
  }

  state.cleanupOwners.add(owner);
  (owner.cleanupFns ??= []).push(() => {
    const currentState = _defaultPortalStates.get(scope);
    if (!currentState) {
      return;
    }

    if (currentState.owner === owner) {
      applyDefaultPortalWrite(currentState, undefined, null);
    }
    currentState.cleanupOwners.delete(owner);
  });
}

function registerExplicitDefaultPortalHost(
  scope: object,
  state: DefaultPortalState,
  owner: ComponentInstance | null
): void {
  if (!owner) {
    return;
  }

  if (!state.explicitHostOwners.has(owner)) {
    state.explicitHostOwners.add(owner);
    notifyExplicitDefaultPortalHostReaders(state);
  }

  if (!state.explicitHostCleanupOwners.has(owner)) {
    state.explicitHostCleanupOwners.add(owner);
    (owner.cleanupFns ??= []).push(() => {
      if (_defaultPortalStates.get(scope) !== state) {
        return;
      }

      state.explicitHostCleanupOwners.delete(owner);
      enqueueRuntimeTask(() => {
        if (_defaultPortalStates.get(scope) !== state) {
          return;
        }

        if (isExplicitHostOwnerConnected(owner)) {
          return;
        }

        if (state.explicitHostOwners.delete(owner)) {
          notifyExplicitDefaultPortalHostReaders(state);
        }
      });
    });
  }
}

export function clearDefaultPortalForInstance(
  instance: ComponentInstance
): void {
  const scope = instance.portalScope;
  if (!scope) {
    return;
  }

  const state = _defaultPortalStates.get(scope);
  if (!state) {
    return;
  }

  _hasPendingDefaultPortalValue = false;
  _pendingDefaultPortalValue = undefined;
  state.portal.render({ children: undefined });
  state.owner = null;
  detachDefaultPortalHostOutput(state);
}

export const DefaultPortal: Portal<RenderableChild> = (() => {
  function Host(props?: DefaultPortalHostProps) {
    const owner = getCurrentComponentInstance();
    const scope = resolveDefaultPortalScope(owner);
    if (!scope) {
      return null;
    }

    const state = getDefaultPortalState(scope);
    state.host = owner;
    const isAutomaticFallback = props?.__askrAutoDefaultPortal === true;
    if (!isAutomaticFallback) {
      registerExplicitDefaultPortalHost(scope, state, owner);
    } else if (readExplicitDefaultPortalHosts(state) > 0) {
      return null;
    }

    applyPendingDefaultPortalValue(scope);
    const value = state.portal();
    return value === undefined ? null : value;
  }

  Host.render = function Render(props: { children?: RenderableChild }) {
    writeDefaultPortal(props, getCurrentComponentInstance());
    return null;
  };

  return Host as Portal<RenderableChild>;
})();

export function Portal(props: PortalProps): null {
  const owner = getCurrentComponentInstance();
  if (owner) {
    registerDefaultPortalOwner(owner);
  }
  writeDefaultPortal(props, owner);
  return null;
}
