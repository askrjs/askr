import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { resource, task } from '../../../src/runtime/operations';
import { state, type State } from '../../../src/runtime/state';
import { navigate } from '../../../src/router/navigate';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('router lifecycle invariants', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    window.history.replaceState({}, '', '/first');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('should abort route-root resources and ignore their stale completions', async () => {
    let resourceSignal: AbortSignal | null = null;
    let resolveResource!: (value: string) => void;

    await createSPA({
      root: container,
      routes: [
        {
          path: '/first',
          handler: () => {
            const result = resource<string>(({ signal }) => {
              resourceSignal = signal;
              return new Promise((resolve) => {
                resolveResource = resolve;
              });
            });
            return <div>{result.value ?? 'loading'}</div>;
          },
        },
        { path: '/other', handler: () => <div>{'other'}</div> },
      ],
    });
    flushScheduler();

    navigate('/other');
    flushScheduler();

    expect(resourceSignal?.aborted).toBe(true);
    expect(container.textContent).toContain('other');

    resolveResource('stale');
    await Promise.resolve();
    await Promise.resolve();
    flushScheduler();

    expect(container.textContent).toContain('other');
    expect(container.textContent).not.toContain('stale');
  });

  it('should dispose route-root state readers and cleanup before mounting the next route', async () => {
    let staleState!: State<number>;
    let routeCleanupCount = 0;
    let otherRenderCount = 0;

    await createSPA({
      root: container,
      routes: [
        {
          path: '/first',
          handler: () => {
            staleState = state(0);
            task(() => () => {
              routeCleanupCount += 1;
            });
            return <div>{String(staleState())}</div>;
          },
        },
        {
          path: '/other',
          handler: () => {
            otherRenderCount += 1;
            return <div>{'other'}</div>;
          },
        },
      ],
    });
    flushScheduler();

    navigate('/other');
    flushScheduler();
    const rendersAfterNavigation = otherRenderCount;

    expect(routeCleanupCount).toBe(1);

    staleState.set(1);
    flushScheduler();

    expect(otherRenderCount).toBe(rendersAfterNavigation);
    expect(container.textContent).toContain('other');
  });
});
