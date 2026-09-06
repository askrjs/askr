import {
  resetRouteState,
  currentRouteRegistry,
} from '../../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../../src/boot';
import {
  defineScope,
  readScope,
} from '../../../../src/runtime/context/context';
import { group, route } from '../../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../../test-utils/render/test-renderer';

describe('routed layout context regression', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/reports');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  it('should execute a routed leaf inside its layout context provider', async () => {
    const Tenant = defineScope('missing-tenant');

    function TenantLayout({ children }: { children?: unknown }) {
      return <Tenant value="tenant:northwind">{children}</Tenant>;
    }

    function ReportsPage() {
      return <p>{readScope(Tenant)}</p>;
    }

    group({ layout: TenantLayout }, () => {
      route('/reports', ReportsPage);
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    expect(container.textContent).toContain('tenant:northwind');
    expect(container.textContent).not.toContain('missing-tenant');
  });
});
