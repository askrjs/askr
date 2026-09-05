import { ownCleanup } from './ownership';
import type { RenderableChild } from '../common/vnode';
import type { JSXElement } from '../common/jsx';
import { getActiveRenderContext } from '../common/render-context';
import {
  createSSRPortalAnchorToken,
  createSSRPortalHostToken,
  SSR_PORTAL_ANCHOR,
  SSR_PORTAL_HOST,
} from '../common/portal';
import { ELEMENT_TYPE } from '../jsx';
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
import { getRuntimeRenderer } from './access';
import {
  adjustPortalRegistrations,
  clearPortalRegistrations,
} from './ownership-diagnostics';
import {
  getCurrentLifecycleCommitBatch,
  registerLifecycleTransaction,
  type LifecycleCommitBatch,
} from './component-lifecycle';
import { registerDefaultPortalRuntime } from '../common/default-portal-runtime';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

/**
 * A named portal channel created by {@link definePortal}: call it as a
 * component to render the host, and call `.render(props)` to write content.
 */
export interface Portal<T extends RenderableChild = RenderableChild> {
  (): T | JSXElement | null | undefined;
  render(props: { children?: T }): unknown;
}

/** Props for the {@link Portal} component. */
export interface PortalProps {
  children?: RenderableChild;
}

const DEFAULT_SSR_PORTAL_KEY = {};

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
    owner.instance.ownership.identity === owner.generation &&
    owner.instance.notifyUpdate !== null
  ) {
    host._portalErrorParent = owner.instance;
    host._portalErrorParentGeneration = owner.generation;
    return;
  }
  host._portalErrorParent = null;
  host._portalErrorParentGeneration = undefined;
}

function getSSRPortalSlot(key: object) {
  const context = getActiveRenderContext();
  if (context?.mode !== 'ssr') {
    return null;
  }

  let slot = context.ssrPortals.slots.get(key);
  if (!slot) {
    slot = {
      hasValue: false,
      value: undefined,
      hosts: [],
    };
    context.ssrPortals.slots.set(key, slot);
  }
  return { context, slot };
}

function createSSRPortalHost(
  key: object,
  automatic: boolean
): JSXElement | null {
  const current = getSSRPortalSlot(key);
  if (!current) {
    return null;
  }

  const token = createSSRPortalHostToken(
    current.context.ssrPortals.nextHostId++
  );
  current.slot.hosts.push({ token, automatic });
  return {
    $$typeof: ELEMENT_TYPE,
    type: SSR_PORTAL_HOST,
    props: { token },
  } as unknown as JSXElement;
}

function writeSSRPortal(
  key: object,
  children: RenderableChild | undefined
): boolean {
  const current = getSSRPortalSlot(key);
  if (!current) {
    return false;
  }
  current.slot.hasValue = true;
  current.slot.value = children;
  return true;
}

function createSSRPortalAnchor(): JSXElement | null {
  const context = getActiveRenderContext();
  if (context?.mode !== 'ssr') {
    return null;
  }
  const token = createSSRPortalAnchorToken(context.ssrPortals.nextHostId++);
  return {
    $$typeof: ELEMENT_TYPE,
    type: SSR_PORTAL_ANCHOR,
    props: { token },
  } as unknown as JSXElement;
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

/** Create a new named {@link Portal} channel with its own host and content. */
export function definePortal<
  T extends RenderableChild = RenderableChild,
>(): Portal<T> {
  const ssrPortalKey = {};

  if (typeof createPortalSlot === 'function') {
    const slot = createPortalSlot<T>();

    function PortalHost() {
      const serverHost = createSSRPortalHost(ssrPortalKey, false);
      if (serverHost) {
        return serverHost;
      }
      const host = getCurrentComponentInstance();
      if (host?.fn === PortalHost) {
        setPortalErrorParent(host, slot.getOwner());
      }
      return slot.read();
    }

    PortalHost.render = function PortalRender(props: { children?: T }) {
      if (writeSSRPortal(ssrPortalKey, props.children)) {
        return null;
      }
      const owner = getCurrentComponentInstance();
      slot.write(
        props.children,
        owner ? { instance: owner, generation: owner.ownership.identity } : null
      );
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
  owner: PortalOwner | null;
  host: PortalOwner | null;
  cleanupOwners: WeakSet<object>;
  explicitHostOwners: Map<object, ComponentInstance>;
  explicitHostCleanupOwners: WeakSet<object>;
  explicitHostSource: ReadableSource<number>;
  ownerVersion: number;
  ownerSource: ReadableSource<number>;
};

type PendingDefaultPortalWrite = {
  state: DefaultPortalState;
  owner: PortalOwner | null;
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

function trackBatchPortalWrite(
  batch: LifecycleCommitBatch,
  state: DefaultPortalState,
  transaction: PendingDefaultPortalWrite
): void {
  let current: LifecycleCommitBatch | null = batch;
  while (current) {
    let writes = _batchPortalWrites.get(current);
    if (!writes) {
      writes = new Map();
      _batchPortalWrites.set(current, writes);
    }
    if (!writes.has(state)) {
      writes.set(state, transaction);
    }
    current = current.parent;
  }
}

function clearTrackedBatchPortalWrite(
  transaction: PendingDefaultPortalWrite
): void {
  let batch = transaction.batch ?? null;
  while (batch) {
    const writes = _batchPortalWrites.get(batch);
    if (writes?.get(transaction.state) === transaction) {
      writes.delete(transaction.state);
    }
    batch = batch.parent;
  }
}

type DefaultPortalHostProps = {
  __askrAutoDefaultPortal?: boolean;
};

function createPortalStateSource(
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

function setDefaultPortalOwner(
  state: DefaultPortalState,
  owner: PortalOwner | null
): void {
  if (
    state.owner?.instance === owner?.instance &&
    state.owner?.generation === owner?.generation
  ) {
    return;
  }
  state.owner = owner;
  state.ownerVersion += 1;
  markReadableDerivedSubscribersDirty(state.ownerSource);
  markReactivePropsDirtySource(state.ownerSource);
  notifyReadableReaders(state.ownerSource);
}

function createDefaultPortalState(): DefaultPortalState {
  const state: DefaultPortalState = {
    portal: definePortal<RenderableChild>(),
    owner: null,
    host: null,
    cleanupOwners: new WeakSet<object>(),
    explicitHostOwners: new Map<object, ComponentInstance>(),
    explicitHostCleanupOwners: new WeakSet<object>(),
    explicitHostSource: (() => 0) as ReadableSource<number>,
    ownerVersion: 0,
    ownerSource: (() => 0) as ReadableSource<number>,
  };

  state.explicitHostSource = createPortalStateSource(
    () => state.explicitHostOwners.size
  );
  state.ownerSource = createPortalStateSource(() => state.ownerVersion);
  return state;
}

export function _resetDefaultPortal(): void {
  if (__ASKR_DEVELOPMENT_BUILD__) {
    for (const state of _defaultPortalStates.values()) {
      clearPortalRegistrations(state);
    }
  }
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
    if (__ASKR_DEVELOPMENT_BUILD__) {
      clearPortalRegistrations(state);
    }
  }

  _defaultPortalStates.delete(scope);
}

function isComponentPortalScope(scope: object): scope is ComponentInstance {
  return (
    'lifecycleGeneration' in scope &&
    'evaluationGeneration' in scope &&
    'parentInstance' in scope
  );
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
  const host = state.host?.instance;
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
  owner: PortalOwner | null
): void {
  state.portal.render({ children });
  setDefaultPortalOwner(state, owner);
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

  return scope.ownership.mounted === false;
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
  const capturedOwner = owner
    ? { instance: owner, generation: owner.ownership.identity }
    : null;
  const batch = getCurrentLifecycleCommitBatch();
  if (batch) {
    let writes = _batchPortalWrites.get(batch);
    if (!writes) {
      writes = new Map();
      _batchPortalWrites.set(batch, writes);
    }

    const existing = writes.get(state);
    if (existing) {
      existing.owner = capturedOwner;
      existing.children = props.children;
      return;
    }

    const transaction: PendingDefaultPortalWrite = {
      state,
      owner: capturedOwner,
      children: props.children,
      batch,
    };
    const registered = registerLifecycleTransaction(
      state,
      () => {
        if (_batchPortalWrites.get(batch)?.get(state) !== transaction) {
          return;
        }
        clearTrackedBatchPortalWrite(transaction);
        applyDefaultPortalWrite(state, transaction.children, transaction.owner);
      },
      () => {
        clearTrackedBatchPortalWrite(transaction);
      },
      () => {
        const parentBatch = batch.parent;
        const parentWrite = parentBatch
          ? _batchPortalWrites.get(parentBatch)?.get(state)
          : undefined;
        if (parentWrite && parentWrite !== transaction) {
          parentWrite.owner = transaction.owner;
          parentWrite.children = transaction.children;
        }
        clearTrackedBatchPortalWrite(transaction);
      }
    );
    if (registered) {
      trackBatchPortalWrite(batch, state, transaction);
      return;
    }
  }

  const pending = _pendingDefaultPortalWrites.get(state);
  if (pending) {
    pending.owner = capturedOwner;
    pending.children = props.children;
    return;
  }

  const transaction: PendingDefaultPortalWrite = {
    state,
    owner: capturedOwner,
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
  applyDefaultPortalWrite(state, props.children, capturedOwner);
}

function applyPendingDefaultPortalValue(scope: object): void {
  if (!_hasPendingDefaultPortalValue) {
    return;
  }

  const state = getDefaultPortalState(scope);
  state.portal.render({ children: _pendingDefaultPortalValue });
  setDefaultPortalOwner(state, null);
  _hasPendingDefaultPortalValue = false;
  _pendingDefaultPortalValue = undefined;
}

function getPendingDefaultPortalWrite(
  state: DefaultPortalState
): PendingDefaultPortalWrite | undefined {
  let batch = getCurrentLifecycleCommitBatch();
  while (batch) {
    const pending = _batchPortalWrites.get(batch)?.get(state);
    if (pending) {
      return pending;
    }
    batch = batch.parent;
  }

  return _pendingDefaultPortalWrites.get(state);
}

function hasPendingReplacementPortalOwner(
  state: DefaultPortalState,
  owner: ComponentInstance,
  generation: object
): boolean {
  const pendingOwner = getPendingDefaultPortalWrite(state)?.owner;
  return Boolean(
    pendingOwner &&
    (pendingOwner.instance !== owner || pendingOwner.generation !== generation)
  );
}

function registerDefaultPortalOwner(owner: ComponentInstance): void {
  const scope = resolveDefaultPortalScope(owner);
  if (!scope) {
    return;
  }

  const state = getDefaultPortalState(scope);
  const generation = owner.ownership.identity;
  if (state.cleanupOwners.has(generation)) {
    return;
  }

  state.cleanupOwners.add(generation);
  if (__ASKR_DEVELOPMENT_BUILD__) {
    adjustPortalRegistrations(state, 1);
  }
  ownCleanup(owner.ownership, () => {
    const currentState = _defaultPortalStates.get(scope);
    if (!currentState) {
      return;
    }

    if (
      currentState.owner?.instance === owner &&
      currentState.owner.generation === generation &&
      !hasPendingReplacementPortalOwner(currentState, owner, generation)
    ) {
      applyDefaultPortalWrite(currentState, undefined, null);
    }
    if (currentState.cleanupOwners.delete(generation)) {
      if (__ASKR_DEVELOPMENT_BUILD__) {
        adjustPortalRegistrations(currentState, -1);
      }
    }
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

  const generation = owner.ownership.identity;
  if (!state.explicitHostOwners.has(generation)) {
    state.explicitHostOwners.set(generation, owner);
    if (__ASKR_DEVELOPMENT_BUILD__) {
      adjustPortalRegistrations(state, 1);
    }
    notifyExplicitDefaultPortalHostReaders(state);
  }

  if (!state.explicitHostCleanupOwners.has(generation)) {
    state.explicitHostCleanupOwners.add(generation);
    ownCleanup(owner.ownership, () => {
      if (_defaultPortalStates.get(scope) !== state) {
        return;
      }

      state.explicitHostCleanupOwners.delete(generation);
      if (
        state.explicitHostOwners.get(generation) === owner &&
        state.explicitHostOwners.delete(generation)
      ) {
        if (__ASKR_DEVELOPMENT_BUILD__) {
          adjustPortalRegistrations(state, -1);
        }
        notifyExplicitDefaultPortalHostReaders(state);
      }
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
  setDefaultPortalOwner(state, null);
  detachDefaultPortalHostOutput(state);
}

/**
 * The implicit portal channel that {@link Portal} writes to and that any
 * host rendered without an explicit portal falls back to.
 */
export const DefaultPortal: Portal<RenderableChild> = (() => {
  function Host(props?: DefaultPortalHostProps) {
    const serverHost = createSSRPortalHost(
      DEFAULT_SSR_PORTAL_KEY,
      props?.__askrAutoDefaultPortal === true
    );
    if (serverHost) {
      return serverHost;
    }

    const owner = getCurrentComponentInstance();
    const scope = resolveDefaultPortalScope(owner);
    if (!scope) {
      return null;
    }

    const state = getDefaultPortalState(scope);
    state.host = owner
      ? { instance: owner, generation: owner.ownership.identity }
      : null;
    const isAutomaticFallback = props?.__askrAutoDefaultPortal === true;
    if (!isAutomaticFallback) {
      registerExplicitDefaultPortalHost(scope, state, owner);
    } else if (readExplicitDefaultPortalHosts(state) > 0) {
      return null;
    }

    applyPendingDefaultPortalValue(scope);
    state.ownerSource();
    setPortalErrorParent(owner, state.owner);
    const value = state.portal();
    return value === undefined ? null : value;
  }

  Host.render = function Render(props: { children?: RenderableChild }) {
    if (writeSSRPortal(DEFAULT_SSR_PORTAL_KEY, props.children)) {
      return null;
    }
    writeDefaultPortal(props, getCurrentComponentInstance());
    return null;
  };

  return Host as Portal<RenderableChild>;
})();

/** Write children to the {@link DefaultPortal} host wherever it is rendered. */
export function Portal(props: PortalProps): JSXElement | null {
  if (writeSSRPortal(DEFAULT_SSR_PORTAL_KEY, props.children)) {
    return createSSRPortalAnchor();
  }

  const owner = getCurrentComponentInstance();
  if (owner) {
    registerDefaultPortalOwner(owner);
  }
  writeDefaultPortal(props, owner);
  return null;
}

registerDefaultPortalRuntime({
  host: DefaultPortal,
  clearForInstance(instance) {
    clearDefaultPortalForInstance(instance as ComponentInstance);
  },
  disposeScope: disposeDefaultPortalScope,
});
