import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { defineScope, readScope } from '../../../src/runtime/context';
import { resource } from '../../../src/runtime/operations';
import { navigate } from '../../../src/router/navigate';
import { group, Outlet, page, route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createControlledDeferred, settleAsyncWork } from './helpers';

describe('layout context resource app flow', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/workspace/overview');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  it('should preserve shared shells while isolating context-backed sibling resources', async () => {
    const overviewRequest = createControlledDeferred<string>();
    const activityRequest = createControlledDeferred<string>();
    const Tenant = defineScope('missing-tenant');
    let overviewSignal: AbortSignal | undefined;
    let activitySignal: AbortSignal | undefined;

    function TenantHeader() {
      return <header>{readScope(Tenant)}</header>;
    }

    function TenantLayout({ children }: { children?: unknown }) {
      return (
        <Tenant value="tenant:northwind">
          <main aria-label="Tenant layout">
            <TenantHeader />
            {children as never}
          </main>
        </Tenant>
      );
    }

    function WorkspacePage() {
      return (
        <section aria-label="Workspace page">
          <h1>Workspace</h1>
          <Outlet />
        </section>
      );
    }

    function OverviewPage() {
      const overview = resource<string>(({ signal }) => {
        overviewSignal = signal;
        const tenant = readScope(Tenant);
        return overviewRequest.promise.then((value) => `${tenant}:${value}`);
      });

      return (
        <article aria-label="Overview">
          {overview.value ?? 'Loading overview...'}
        </article>
      );
    }

    function ActivityPage() {
      const activity = resource<string>(({ signal }) => {
        activitySignal = signal;
        const tenant = readScope(Tenant);
        return activityRequest.promise.then((value) => `${tenant}:${value}`);
      });

      return (
        <article aria-label="Activity">
          {activity.value ?? 'Loading activity...'}
        </article>
      );
    }

    group({ layout: TenantLayout }, () => {
      page('/workspace', WorkspacePage, () => {
        route('overview', OverviewPage);
        route('activity', ActivityPage);
      });
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const layout = container.querySelector('[aria-label="Tenant layout"]');
    const workspace = container.querySelector('[aria-label="Workspace page"]');
    expect(container.textContent).toContain('tenant:northwind');
    expect(container.textContent).toContain('Loading overview...');

    navigate('/workspace/activity');
    flushScheduler();

    expect(container.querySelector('[aria-label="Tenant layout"]')).toBe(
      layout
    );
    expect(container.querySelector('[aria-label="Workspace page"]')).toBe(
      workspace
    );
    expect(overviewSignal?.aborted).toBe(true);
    expect(container.textContent).toContain('Loading activity...');

    activityRequest.resolve('recent changes');
    await settleAsyncWork();

    expect(activitySignal?.aborted).toBe(false);
    expect(container.textContent).toContain('tenant:northwind:recent changes');

    overviewRequest.resolve('stale summary');
    await settleAsyncWork();

    expect(container.textContent).toContain('tenant:northwind:recent changes');
    expect(container.textContent).not.toContain('stale summary');
  });
});
