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

export interface Portal<T = unknown> {
  /** Mount point — rendered exactly once */
  (): unknown;

  /** Render content into the portal */
  render(props: { children?: T }): unknown;
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

/**
 * Default Portal Singleton
 *
 * POLICY (LOCKED):
 * There is exactly one default portal per runtime.
 * Tests must reset it explicitly using _resetDefaultPortal().
 * This ensures consistent portal behavior across the application
 * while maintaining test isolation.
 */
let _defaultPortal: Portal<unknown> | undefined;

export function _resetDefaultPortal(): void {
  _defaultPortal = undefined;
}

function ensureDefaultPortal(): Portal<unknown> {
  if (!_defaultPortal) _defaultPortal = definePortal<unknown>();
  return _defaultPortal;
}

export const DefaultPortal: Portal<unknown> = (() => {
  function Host() {
    const v = ensureDefaultPortal()();
    return v === undefined ? null : v;
  }
  Host.render = function Render(props: { children?: unknown }) {
    ensureDefaultPortal().render(props);
    return null;
  };
  return Host as Portal<unknown>;
})();

/**
 * NOTE:
 * createPortalSlot is a runtime primitive.
 * It owns scheduling, consistency, and SSR behavior.
 */
declare function createPortalSlot<T>(): {
  read(): unknown;
  write(value: T | undefined): void;
};
