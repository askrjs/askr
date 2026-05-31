/**
 * Portal / Host primitive.
 *
 * Foundations remain runtime-agnostic: a portal is an explicit read/write slot.
 * Scheduling and attachment are owned by the runtime when `createPortalSlot`
 * exists; otherwise this falls back to a local slot (deterministic, but does
 * not schedule updates).
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Local Mutable State
 *    Foundations may use local mutable state ONLY to model deterministic slots,
 *    never to coordinate timing, effects, or ordering. The fallback mode uses
 *    closure-local `mounted` and `value` variables which are non-escaping and
 *    deterministic.
 *
 * 2. Return Type Philosophy
 *    Portal call signatures return `unknown` (intentionally opaque). The runtime
 *    owns the concrete type. This prevents foundations from assuming JSX.Element
 *    or DOM node types, maintaining runtime-agnostic portability.
 */

import {
  markReactivePropsDirtySource,
  markReadableDerivedSubscribersDirty,
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from '../../runtime/readable';
import {
  getCurrentComponentInstance,
  getCurrentPortalScope,
  type ComponentInstance,
} from '../../runtime/component';

export interface Portal<T = unknown> {
  /** Mount point — rendered exactly once */
  (): unknown;

  /** Render content into the portal */
  render(props: { children?: T }): unknown;
}

export interface PortalProps {
  children?: unknown;
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

export function definePortal<T = unknown>(): Portal<T> {
  // Using `typeof createPortalSlot` is safe even if the identifier is not
  // defined at runtime (it returns 'undefined' rather than throwing).
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

  // Deterministic local fallback (SSR/tests). No runtime scheduling.
  // Writes are accepted only after the host has rendered at least once.
  //
  // CRITICAL BEHAVIOR:
  // - Writes update local state but do NOT trigger re-renders
  // - The portal host will reflect changes only when the component tree
  //   re-renders for other reasons (e.g., parent state change)
  // - This is safe for SSR and tests where rendering is synchronous
  //   and externally controlled
  // - In runtime mode, createPortalSlot handles scheduling automatically
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
  portal: Portal<unknown>;
  owner: ComponentInstance | null;
  cleanupOwners: WeakSet<ComponentInstance>;
};

let _defaultPortalStates = new Map<object, DefaultPortalState>();
let _hasPendingDefaultPortalValue = false;
let _pendingDefaultPortalValue: unknown = undefined;

export function _resetDefaultPortal(): void {
  _defaultPortalStates = new Map<object, DefaultPortalState>();
  _hasPendingDefaultPortalValue = false;
  _pendingDefaultPortalValue = undefined;
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
    state = {
      portal: definePortal<unknown>(),
      owner: null,
      cleanupOwners: new WeakSet<ComponentInstance>(),
    };
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
  _hasPendingDefaultPortalValue = false;
  _pendingDefaultPortalValue = undefined;
  state.portal.render(props);
  state.owner = owner;
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
  owner.cleanupFns.push(() => {
    const currentState = _defaultPortalStates.get(scope);
    if (!currentState) {
      return;
    }

    if (currentState.owner === owner) {
      currentState.portal.render({ children: undefined });
      currentState.owner = null;
    }
    currentState.cleanupOwners.delete(owner);
  });
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
}

export const DefaultPortal: Portal<unknown> = (() => {
  function Host() {
    const scope = resolveDefaultPortalScope(getCurrentComponentInstance());
    if (!scope) {
      return null;
    }

    applyPendingDefaultPortalValue(scope);
    const v = getDefaultPortalState(scope).portal();
    return v === undefined ? null : v;
  }
  Host.render = function Render(props: { children?: unknown }) {
    writeDefaultPortal(props, getCurrentComponentInstance());
    return null;
  };
  return Host as Portal<unknown>;
})();

export function Portal(props: PortalProps): null {
  const owner = getCurrentComponentInstance();
  if (owner) {
    registerDefaultPortalOwner(owner);
  }
  writeDefaultPortal(props, owner);
  return null;
}

/**
 * NOTE:
 * createPortalSlot is a runtime primitive.
 * It owns scheduling, consistency, and SSR behavior.
 */
