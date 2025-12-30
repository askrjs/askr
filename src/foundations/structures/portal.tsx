/**
 * Portal / Host primitive.
 *
 * A portal is a named render slot within the existing tree.
 * It does NOT create a second tree or touch the DOM directly.
 */

import { getCurrentComponentInstance } from '../../runtime/component';
import type { ComponentInstance } from '../../runtime/component';
import { logger } from '../../dev/logger';

export interface Portal<T = unknown> {
  /** Mount point — rendered exactly once */
  (): unknown;

  /** Render content into the portal */
  render(props: { children?: T }): unknown;
}

export function definePortal<T = unknown>(): Portal<T> {
  // If the runtime primitive isn't installed yet, provide a no-op fallback.
  // Using `typeof createPortalSlot` is safe even if the identifier is not
  // defined at runtime (it returns 'undefined' rather than throwing).
  if (typeof createPortalSlot !== 'function') {
    // Fallback implementation for environments where the runtime primitive
    // isn't available (tests, SSR).
    //
    // Invariants this fallback tries to maintain:
    // - Always use the *current* host instance (update `owner` each render)
    // - Preserve the last `value` written before host mounts and expose it so
    //   it can be flushed into a real portal if/when the runtime installs
    // - Schedule `owner.notifyUpdate()` when a host exists so updates are
    //   reflected immediately
    // Fast fallback for module/SSR/test environments.
    // Track a single owner to avoid per-render array scans.
    let owner: ComponentInstance | null = null;
    let pending: T | undefined;

    function HostFallback() {
      // Drop owner + pending when owner unmounts to avoid replay.
      if (owner && owner.mounted === false) {
        owner = null;
        pending = undefined;
      }

      const inst = getCurrentComponentInstance();

      // Capture the first host as the owner.
      // We intentionally do NOT require `mounted === true` here because the
      // host can render before the runtime flips its mounted flag. Capturing
      // early ensures `DefaultPortal.render()` works immediately after mount.
      if (!owner && inst) owner = inst;

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production') {
        const ns =
          (globalThis as unknown as { __ASKR__?: Record<string, unknown> })
            .__ASKR__ ||
          ((
            globalThis as unknown as { __ASKR__?: Record<string, unknown> }
          ).__ASKR__ = {} as Record<string, unknown>);
        ns.__PORTAL_READS = ((ns.__PORTAL_READS as number) || 0) + 1;
      }

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production') {
        // Minimal dev diagnostics; avoid heavy allocations in the hot path.
        if (inst && owner && inst !== owner && inst.mounted === true) {
          logger.warn(
            '[Portal] multiple mounted hosts detected; first mounted host is owner'
          );
        }
      }

      return inst && owner && inst === owner ? (pending as unknown) : undefined;
    }

    HostFallback.render = function RenderFallback(props: { children?: T }) {
      // Owner must be fully mounted (mounted === true) to accept writes.
      if (!owner || owner.mounted !== true) return null;

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production') {
        const ns =
          (globalThis as unknown as { __ASKR__?: Record<string, unknown> })
            .__ASKR__ ||
          ((
            globalThis as unknown as { __ASKR__?: Record<string, unknown> }
          ).__ASKR__ = {} as Record<string, unknown>);
        ns.__PORTAL_WRITES = ((ns.__PORTAL_WRITES as number) || 0) + 1;
      }

      // Update pending value for the live owner
      pending = props.children as T | undefined;

      // Schedule an update on the owner so it re-renders
      if (owner.notifyUpdate) owner.notifyUpdate();
      return null;
    };

    return HostFallback as Portal<T>;
  }

  // Runtime-provided slot implementation
  const slot = createPortalSlot<T>();

  function PortalHost() {
    return slot.read();
  }

  PortalHost.render = function PortalRender(props: { children?: T }) {
    // Keep counter increment guarded for dev-only behavior
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      const ns =
        (globalThis as unknown as { __ASKR__?: Record<string, unknown> })
          .__ASKR__ ||
        ((
          globalThis as unknown as { __ASKR__?: Record<string, unknown> }
        ).__ASKR__ = {} as Record<string, unknown>);
      ns.__PORTAL_WRITES = ((ns.__PORTAL_WRITES as number) || 0) + 1;
    }
    slot.write(props.children);
    return null;
  };

  return PortalHost as Portal<T>;
}

// Default portal instance: lazily created wrapper so runtime primitive is not
// invoked during module initialization (avoids ReferenceError when runtime
// slot primitive is not yet installed).
let _defaultPortal: Portal<unknown> | undefined;
let _defaultPortalIsFallback = false;

/**
 * Reset the default portal state. Used by tests to ensure isolation.
 * @internal
 */
export function _resetDefaultPortal(): void {
  _defaultPortal = undefined;
  _defaultPortalIsFallback = false;
}

function ensureDefaultPortal(): Portal<unknown> {
  // If a portal hasn't been initialized yet, create a real portal if the
  // runtime primitive exists; otherwise create a fallback. If a fallback
  // was previously created and the runtime primitive becomes available
  // later, replace the fallback with a real portal on first use.
  if (!_defaultPortal) {
    if (typeof createPortalSlot === 'function') {
      _defaultPortal = definePortal<unknown>();
      _defaultPortalIsFallback = false;
    } else {
      // Create a fallback via definePortal so it uses the same owner/pending
      // semantics as the non-default portals (keeps runtime and fallback
      // behavior consistent).
      _defaultPortal = definePortal<unknown>();
      _defaultPortalIsFallback = true;
    }
    return _defaultPortal;
  }

  // Replace fallback with real portal once runtime primitive becomes available
  // NOTE: We intentionally do NOT replay pending writes from a fallback.
  // Early writes are dropped by design to avoid replaying invisible UI.
  if (_defaultPortalIsFallback && typeof createPortalSlot === 'function') {
    const real = definePortal<unknown>();
    _defaultPortal = real;
    _defaultPortalIsFallback = false;
  }

  // If the runtime primitive is removed (tests may simulate this by
  // deleting `createPortalSlot` between runs), revert to a fallback so
  // subsequent tests observe the appropriate fallback semantics.
  if (!_defaultPortalIsFallback && typeof createPortalSlot !== 'function') {
    const fallback = definePortal<unknown>();
    _defaultPortal = fallback;
    _defaultPortalIsFallback = true;
  }

  return _defaultPortal;
}

export const DefaultPortal: Portal<unknown> = (() => {
  function Host() {
    // Delegate to the lazily-created portal host (created when runtime is ready)
    // Return null when no pending value exists so the component renders nothing
    // (consistent with SSR which renders Fragment children as empty string)
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
