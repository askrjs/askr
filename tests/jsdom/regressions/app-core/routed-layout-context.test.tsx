import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../../src/boot';
import { defineContext, readContext } from '../../../../src/runtime/context';
import {
  clearRoutes,
  getManifest,
  group,
  route,
} from '../../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../../test-utils/render/test-renderer';

describe('routed layout context regression', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    clearRoutes();
    window.history.replaceState({}, '', '/reports');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    clearRoutes();
    window.history.replaceState({}, '', '/');
  });

  it('should execute a routed leaf inside its layout context provider', async () => {
    const Tenant = defineContext('missing-tenant');

    function TenantLayout({ children }: { children?: unknown }) {
      return <Tenant.Scope value="tenant:northwind">{children}</Tenant.Scope>;
    }

    function ReportsPage() {
      return <p>{readContext(Tenant)}</p>;
    }

    group({ layout: TenantLayout }, () => {
      route('/reports', ReportsPage);
    });

    await createSPA({ root: container, manifest: getManifest() });
    flushScheduler();

    expect(container.textContent).toContain('tenant:northwind');
    expect(container.textContent).not.toContain('missing-tenant');
  });
});
