import {
  resetRouteState,
  currentRouteRegistry,
} from '../../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../../src/boot';
import { resource } from '../../../../src/runtime/operations';
import { navigate } from '../../../../src/router/navigate';
import { group, route } from '../../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../../test-utils/render/test-renderer';
import {
  createControlledDeferred,
  settleAsyncWork,
} from '../../app-flows/helpers';

describe('routed nested resource cleanup regression', () => {
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

  it('should abort a nested routed resource while retaining shared layout DOM', async () => {
    const request = createControlledDeferred<string>();
    let reportSignal: AbortSignal | undefined;

    function Shell({ children }: { children?: unknown }) {
      return <main>{children as never}</main>;
    }

    function Reports() {
      const report = resource<string>(({ signal }) => {
        reportSignal = signal;
        return request.promise;
      });

      return <p>{report.value ?? 'loading'}</p>;
    }

    group({ layout: Shell }, () => {
      route('/reports', Reports);
      route('/settings', () => <p>settings</p>);
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const shell = container.querySelector('main');

    navigate('/settings');
    flushScheduler();

    expect(container.querySelector('main')).toBe(shell);
    expect(reportSignal?.aborted).toBe(true);

    request.resolve('stale report');
    await settleAsyncWork();

    expect(container.textContent).toContain('settings');
    expect(container.textContent).not.toContain('stale report');
  });
});
