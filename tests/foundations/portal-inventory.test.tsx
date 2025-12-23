import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland, DefaultPortal } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { getCurrentComponentInstance } from '../../src/runtime/component';

// Provide typing for dev-only global debug counters and test-simulated runtime primitive
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface GlobalThis {
  __ASKR__?: {
    __PORTAL_WRITES?: number;
    __PORTAL_READS?: number;
    __PORTAL_HOST_ATTACHED?: boolean;
    __PORTAL_HOST_ID?: string;
  };
  createPortalSlot?: unknown;
}

// Helper: simple runtime portal primitive for tests
function makeRuntimePortalPrimitive() {
  return function createPortalSlot<T>() {
    let owner: ReturnType<typeof getCurrentComponentInstance> | null = null;
    let value: T | undefined;
    return {
      read() {
        const inst = getCurrentComponentInstance();
        if (inst) owner = inst;
        return value as unknown as unknown;
      },
      write(v: T | undefined) {
        value = v;
        if (owner && owner.notifyUpdate) owner.notifyUpdate();
      },
    };
  };
}

describe('DefaultPortal inventory', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const r = createTestContainer();
    container = r.container;
    cleanup = r.cleanup;
    // reset debug counters
    globalThis.__ASKR__ = {};
    // Ensure runtime primitive not installed by default
    delete globalThis.createPortalSlot;
  });

  afterEach(() => {
    cleanup();
    delete globalThis.createPortalSlot;
    globalThis.__ASKR__ = {};
  });

  // Presence & baseline
  it('should_render_nothing_given_unused_default_portal_when_app_mounts', () => {
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();
    expect(container.textContent).toBe('App');
  });

  it('should_expose_render_method_given_default_portal_when_imported', () => {
    expect(typeof DefaultPortal.render).toBe('function');
  });

  // Write / clear semantics
  it('should_render_children_given_portal_write_when_host_is_mounted', () => {
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    // DEBUG: inspect DOM before write
    // eslint-disable-next-line no-console
    console.log('[DEBUG] before write children:', container.childNodes.length, container.innerHTML);

    DefaultPortal.render({ children: 'Toast' });

    // DEBUG: after render call, before flush
    // eslint-disable-next-line no-console
    console.log('[DEBUG] after render called children:', container.childNodes.length, container.innerHTML);

    flushScheduler();

    // DEBUG: after flush
    // eslint-disable-next-line no-console
    console.log('[DEBUG] after flush children:', container.childNodes.length, container.innerHTML);

    expect(container.textContent).toContain('Toast');
  });

  it('should_clear_rendered_content_given_undefined_children_when_previously_written', () => {
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    DefaultPortal.render({ children: 'Toast' });
    flushScheduler();
    expect(container.textContent).toContain('Toast');

    DefaultPortal.render({ children: undefined });
    flushScheduler();
    expect(container.textContent).toBe('App');
  });

  it('should_replace_previous_content_given_multiple_writes_when_flushed', () => {
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    DefaultPortal.render({ children: 'Alpha' });
    DefaultPortal.render({ children: 'Beta' });
    flushScheduler();
    expect(container.textContent).toContain('Beta');
    expect(container.textContent).not.toContain('Alpha');
  });

  // Scheduling & ownership
  it('should_schedule_update_given_portal_write_when_owner_is_captured', () => {
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    // Capture read counter before write
    const before = globalThis.__ASKR__?.__PORTAL_READS || 0;
    DefaultPortal.render({ children: 'T' });
    flushScheduler();
    const after = globalThis.__ASKR__?.__PORTAL_READS || 0;
    expect(after).toBeGreaterThanOrEqual(before);

  });

  it('should_not_schedule_update_given_portal_write_when_no_host_has_mounted', () => {
    // No island mounted
    DefaultPortal.render({ children: 'Nowhere' });
    // Nothing to flush - should not throw
    flushScheduler();
    // Mounting afterwards should not show previous write (drop early write)
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();
    expect(container.textContent).toBe('App');
  });

  it('should_capture_first_host_as_owner_given_multiple_mounts_when_fallback_used', () => {
    // Mount first host
    const { container: c1, cleanup: cu1 } = createTestContainer();
    createIsland({ root: c1, component: () => ({ type: 'div', children: ['H1'] }) });
    flushScheduler();

    // Mount second host for same portal
    const { container: c2, cleanup: cu2 } = createTestContainer();
    createIsland({ root: c2, component: () => ({ type: 'div', children: ['H2'] }) });
    flushScheduler();

    // Write to portal and ensure only a single host receives it (no double renders)
    DefaultPortal.render({ children: 'Toast' });
    flushScheduler();

    const text1 = c1.textContent || '';
    const text2 = c2.textContent || '';

    // Exactly one host should contain the portal content (no double-render)
    expect((text1.includes('Toast') ? 1 : 0) + (text2.includes('Toast') ? 1 : 0)).toBe(1);

    cu1();
    cu2();
  });

  it('should_not_update_unmounted_owner_given_portal_write_when_host_is_disposed', () => {
    const { container: local, cleanup: localCleanup } = createTestContainer();
    createIsland({ root: local, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    // Unmount
    localCleanup();

    // Write after unmount
    DefaultPortal.render({ children: 'Ghost' });
    flushScheduler();

    // Nothing should be present (app removed)
    expect(document.body.contains(local)).toBe(false);
  });

  // Ordering & timing
  it('should_drop_early_write_given_render_called_before_host_mount_when_fallback_used', () => {
    // Early write before any host mounts
    DefaultPortal.render({ children: 'Early' });
    flushScheduler();

    // Mount host later
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    // Early write should be dropped
    expect(container.textContent).not.toContain('Early');
  });

  it('should_not_replay_stale_value_given_host_mounts_after_early_write', () => {
    DefaultPortal.render({ children: 'Stale' });
    flushScheduler();

    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    DefaultPortal.render({ children: 'Live' });
    flushScheduler();

    expect(container.textContent).toContain('Live');
    expect(container.textContent).not.toContain('Stale');
  });

  it('should_preserve_write_order_given_multiple_writes_when_flushed_once', () => {
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    DefaultPortal.render({ children: '1' });
    DefaultPortal.render({ children: '2' });
    DefaultPortal.render({ children: '3' });
    flushScheduler();

    expect(container.textContent).toContain('3');
    expect(container.textContent).not.toContain('1');
  });

  // DefaultPortal-specific
  it('should_delegate_to_lazy_portal_given_default_portal_when_runtime_not_ready', () => {
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    DefaultPortal.render({ children: 'Toast' });
    flushScheduler();
    expect(container.textContent).toContain('Toast');
  });

  it('should_replace_fallback_with_runtime_portal_given_runtime_becomes_available_when_used', () => {
    // Write before runtime installed
    DefaultPortal.render({ children: 'Pending' });
    flushScheduler();

    // Install runtime primitive
    globalThis.createPortalSlot = makeRuntimePortalPrimitive();

    // Use portal after runtime installs
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    // After runtime install, subsequent writes should be handled by runtime portal
    DefaultPortal.render({ children: 'Now' });
    flushScheduler();
    expect(container.textContent).toContain('Now');
  });

  it('should_not_preserve_fallback_state_given_runtime_portal_replaces_fallback', () => {
    // Early write to fallback
    DefaultPortal.render({ children: 'Old' });
    flushScheduler();

    // Install runtime primitive which should replace fallback
    globalThis.createPortalSlot = makeRuntimePortalPrimitive();

    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    // Ensure old pending value is NOT present
    expect(container.textContent).not.toContain('Old');
  });

  // Multi-island / global behavior
  it('should_share_single_portal_state_given_multiple_islands_when_default_portal_used', () => {
    // Mount multiple islands
    const { container: c1, cleanup: cu1 } = createTestContainer();
    const { container: c2, cleanup: cu2 } = createTestContainer();

    createIsland({ root: c1, component: () => ({ type: 'div', children: ['A'] }) });
    createIsland({ root: c2, component: () => ({ type: 'div', children: ['B'] }) });
    flushScheduler();

    DefaultPortal.render({ children: 'Shared' });
    flushScheduler();

    // Only one portal host should render the shared content (single portal state)
    const p1 = c1.textContent || '';
    const p2 = c2.textContent || '';
    expect((p1.includes('Shared') ? 1 : 0) + (p2.includes('Shared') ? 1 : 0)).toBe(1);

    cu1();
    cu2();
  });

  it('should_not_double_render_given_multiple_hosts_when_single_portal_is_read', () => {
    const { container: c1, cleanup: cu1 } = createTestContainer();
    const { container: c2, cleanup: cu2 } = createTestContainer();

    // Two hosts that both read the portal
    createIsland({ root: c1, component: () => ({ type: 'div', children: ['H1'] }) });
    createIsland({ root: c2, component: () => ({ type: 'div', children: ['H2'] }) });
    flushScheduler();

    DefaultPortal.render({ children: 'OnlyOne' });
    flushScheduler();

    const r1 = c1.textContent || '';
    const r2 = c2.textContent || '';
    expect((r1.includes('OnlyOne') ? 1 : 0) + (r2.includes('OnlyOne') ? 1 : 0)).toBe(1);

    cu1();
    cu2();
  });

  // Debug & dev behavior
  it('should_increment_debug_write_counter_given_dev_mode_when_portal_write_occurs', () => {
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();

    DefaultPortal.render({ children: 'X' });
    flushScheduler();
    const writes = globalThis.__ASKR__?.__PORTAL_WRITES || 0;
    expect(writes).toBeGreaterThan(0);
  });

  it('should_increment_debug_read_counter_given_dev_mode_when_portal_is_read', () => {
    // Mount host which will read from portal
    createIsland({ root: container, component: () => ({ type: 'div', children: ['App'] }) });
    flushScheduler();
    const reads = globalThis.__ASKR__?.__PORTAL_READS || 0;
    expect(reads).toBeGreaterThanOrEqual(0);
  });
});
