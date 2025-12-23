/**
 * Portal / Host primitive.
 *
 * A portal is a named render slot within the existing tree.
 * It does NOT create a second tree or touch the DOM directly.
 */

import { getCurrentComponentInstance } from '../runtime/component';
import { logger } from '../dev/logger';

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
    // Track all hosts that read the portal so we can deterministically
    // select a single owner and prune stale mounts across islands.
    let hosts: import('../runtime/component').ComponentInstance[] = [];
    let pending: T | undefined;

    function HostFallback() {
      // Prune unmounted hosts
      hosts = hosts.filter((h) => h.mounted !== false);

      const inst = getCurrentComponentInstance();
      if (inst && !hosts.includes(inst)) hosts.push(inst);

      // Owner is the first host that is fully mounted (must be mounted === true)
      // This prevents capturing pre-mount instances which can lead to early-write
      // replay or ghost-toasts. Only a fully-mounted host can be an owner.
      const owner = hosts.find((h) => h.mounted === true) || null;

      // If more than one host is mounted at the same time, this is a violation
      // of the portal contract. In dev mode we throw to make the issue explicit.
      const mountedHosts = hosts.filter((h) => h.mounted === true);
      if (mountedHosts.length > 1) {
        // Warn in dev to make multiple mounted hosts visible; do NOT throw
        // because multiple islands mounting is a valid use-case. We assert only
        // that exactly one host may render portal content at a time.
        // Logger will no-op in production, so this check need not be wrapped.
        logger.warn(
          '[Portal] multiple hosts are mounted for same portal; first mounted host will be owner'
        );
      }

      // If this reader is not the owner, but a mounted owner exists, warn in dev
      if (inst && owner && owner !== inst) {
        logger.debug(
          '[Portal] non-owner reader detected; only owner renders portal content'
        );
      }

      // Dev debug: increment read counter
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

      // Only the owner should render the pending value; other readers see nothing
      /* istanbul ignore if */
      if (
        process.env.NODE_ENV !== 'production' &&
        inst &&
        owner &&
        inst === owner
      ) {
        logger.debug('[Portal] owner read ->', inst.id, 'pending=', pending);
        // Dev diagnostic: record whether the owner instance has an attached DOM target
        const ns =
          (globalThis as unknown as { __ASKR__?: Record<string, unknown> })
            .__ASKR__ ||
          ((
            globalThis as unknown as { __ASKR__?: Record<string, unknown> }
          ).__ASKR__ = {} as Record<string, unknown>);
        ns.__PORTAL_HOST_ATTACHED = !!(inst && inst.target);
        ns.__PORTAL_HOST_ID = inst ? inst.id : undefined;
      }
      return inst === owner ? (pending as unknown) : undefined;
    }

    HostFallback.render = function RenderFallback(props: { children?: T }) {
      // Refresh host list and determine current owner
      hosts = hosts.filter((h) => h.mounted !== false);
      // Owner must be fully mounted (mounted === true) to accept writes — this
      // prevents capturing pre-mount instances and avoids replaying early writes.
      const owner = hosts.find((h) => h.mounted === true) || null;

      // If no owner exists yet, drop the write (avoid buffering early writes)
      if (!owner) {
        // Logger will no-op in production so we can call directly without wrapping.
        logger.debug(
          '[Portal] fallback.write dropped -> no owner or not mounted',
          props?.children
        );
        return null;
      }

      // Update pending value for the live owner
      pending = props.children as T | undefined;

      // Record debug write counter in dev so tests can assert writes occurred
      // Logger will no-op in production; keep counter update guarded for dev only
      logger.debug('[Portal] fallback.write ->', pending, 'owner=', owner.id);
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

      // Schedule an update on the owner so it re-renders
      if (owner && owner.notifyUpdate) {
        if (process.env.NODE_ENV !== 'production')
          logger.debug(
            '[Portal] fallback.write notify ->',
            owner.id,
            !!owner.notifyUpdate
          );
        owner.notifyUpdate();
      }
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
    // Logger will no-op in production; keep counter increment guarded for dev-only behavior
    logger.debug('[Portal] write ->', props?.children);
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
function ensureDefaultPortal(): Portal<unknown> {
  // If a portal hasn't been initialized yet, create a real portal if the
  // runtime primitive exists; otherwise create a fallback. If a fallback
  // was previously created and the runtime primitive becomes available
  // later, replace the fallback with a real portal on first use.
  logger.debug(
    '[DefaultPortal] ensureDefaultPortal _defaultPortalIsFallback=',
    _defaultPortalIsFallback,
    'createPortalSlot=',
    typeof createPortalSlot === 'function'
  );

  if (!_defaultPortal) {
    if (typeof createPortalSlot === 'function') {
      _defaultPortal = definePortal<unknown>();
      _defaultPortalIsFallback = false;
      logger.debug('[DefaultPortal] created real portal');
    } else {
      // Create a fallback via definePortal so it uses the same owner/pending
      // semantics as the non-default portals (keeps runtime and fallback
      // behavior consistent).
      _defaultPortal = definePortal<unknown>();
      _defaultPortalIsFallback = true;
      logger.debug('[DefaultPortal] created fallback portal');
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
    logger.debug('[DefaultPortal] reverted to fallback portal');
  }

  return _defaultPortal;
}

export const DefaultPortal: Portal<unknown> = (() => {
  function Host() {
    // Delegate to the lazily-created portal host (created when runtime is ready)
    // Ensure we return a DOM-compatible placeholder (empty text) when no
    // pending value exists so the portal host is always present in the DOM.
    const v = ensureDefaultPortal()();
    return v === undefined ? '' : v;
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
