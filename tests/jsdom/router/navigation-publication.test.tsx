/**
 * Navigation root publication is released exactly once, and never for a
 * superseded request.
 *
 * `commitNavigationRoots().complete()` previously published inside its `try`
 * and again in its `finally`, so a successful navigation released staged root
 * state twice. The stale guard also returned from inside that `try`, so the
 * `finally` still published for a request that had already been superseded.
 *
 * `PreparedRootUpdate.publish()` is an idempotent WeakMap delete, so neither
 * defect is observable as corruption today. These cases pin the contract so it
 * stays true if publication ever gains non-idempotent work.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, route } from '../../../src/router/route';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import { createSPA } from '@askrjs/askr/boot';
import { resetRouteState } from '../../router-test-utils';

const publishCalls: string[] = [];

vi.mock('../../../src/common/app-render-runtime', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../src/common/app-render-runtime')
    >();
  return {
    ...actual,
    clearStagedAppRenderRouteLocation(
      runtime: Parameters<typeof actual.clearStagedAppRenderRouteLocation>[0]
    ): void {
      // Record every release attempt, including ones that find the entry
      // already gone -- a repeated release is exactly the defect under test.
      if (runtime) publishCalls.push(String(publishCalls.length));
      actual.clearStagedAppRenderRouteLocation(runtime);
    },
  };
});

describe('navigation root publication (ROUTER)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    publishCalls.length = 0;
    resetRouteState();
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    window.history.replaceState({}, '', '/pub-start');
  });

  afterEach(() => {
    cleanup();
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  it('should publish each navigation root exactly once', async () => {
    const registry = createRouteRegistry(() => {
      route('/pub-start', () => <div>start</div>);
      route('/pub-next', () => <div>next</div>);
    });

    await createSPA({ root: container, registry });

    publishCalls.length = 0;
    navigate('/pub-next');
    await vi.waitFor(() => expect(container.textContent).toContain('next'));

    // One staged location released, for the single root being committed.
    // Two entries here would mean the try-body and finally both published.
    expect(publishCalls).toHaveLength(1);
  });

  // Invariant guard, not a regression reproducer: the earlier staleness checks
  // in commitNavigationRoots currently stop a superseded request before it
  // reaches complete(), so this passes with or without the fix. It pins the
  // contract in case those earlier checks move or are relaxed.
  it('should not publish a superseded navigation', async () => {
    let releaseSlow: (() => void) | undefined;
    const registry = createRouteRegistry(() => {
      route('/pub-start', () => <div>start</div>);
      route('/pub-slow', () => <div>slow</div>, {
        loader: () =>
          new Promise<string>((resolve) => {
            releaseSlow = () => resolve('slow-data');
          }),
      });
      route('/pub-fast', () => <div>fast</div>);
    });

    await createSPA({ root: container, registry });

    // Start a navigation that cannot settle, then supersede it.
    navigate('/pub-slow');
    await vi.waitFor(() => expect(releaseSlow).toBeDefined());
    navigate('/pub-fast');
    await vi.waitFor(() => expect(container.textContent).toContain('fast'));

    publishCalls.length = 0;
    // Let the superseded request finish resolving; it must not publish.
    releaseSlow?.();
    await vi.waitFor(() => expect(container.textContent).toContain('fast'));

    expect(publishCalls).toHaveLength(0);
  });
});
