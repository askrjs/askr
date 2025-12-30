/**
 * Portal / Host primitive.
 *
 * Foundations remain runtime-agnostic: a portal is an explicit read/write slot.
 * Scheduling and attachment are owned by the runtime when `createPortalSlot`
 * exists; otherwise this falls back to a local slot (deterministic, but does
 * not schedule updates).
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
