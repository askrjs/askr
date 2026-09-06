import {
  resetRouteState,
  currentRouteRegistry,
} from '../../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { cleanupApp, createSPA } from '../../../../src/boot';
import { state } from '../../../../src/runtime/reactivity/state';
import {
  recordReadableRead,
  notifyReadableReaders,
  type ReadableSource,
} from '../../../../src/runtime/reactivity/readable';
import { group, route } from '../../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
}

describe('routed theme remount loading recovery', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/example');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  it('should recover a routed loading branch when the readable source changes during a remounting theme toggle', async () => {
    let content = 'Loading messaging topology...';
    function topology() {
      recordReadableRead(topology as unknown as ReadableSource<string>);
      return content;
    }
    let step = 0;
    let didMutate = false;

    function TopologyPage() {
      return <section data-testid="topology-page">{topology()}</section>;
    }

    function MutateAfterRemount() {
      if (didMutate) {
        return null;
      }

      didMutate = true;
      content = 'Messaging topology';
      notifyReadableReaders(topology as unknown as ReadableSource<string>);
      return null;
    }

    function ThemeShell({ children }: { children?: unknown }) {
      const phase = state(0);
      step = phase();

      return (
        <div data-theme={phase() % 2 === 0 ? 'light' : 'dark'}>
          <header>
            <button
              type="button"
              onClick={() => phase.set((value) => value + 1)}
            >
              Toggle theme
            </button>
          </header>
          <main>
            {phase() === 0 ? (children as never) : null}
            {phase() >= 2 ? (children as never) : null}
            {phase() >= 2 ? <MutateAfterRemount /> : null}
          </main>
        </div>
      );
    }

    group({ layout: ThemeShell }, () => {
      route('/example', TopologyPage);
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const toggle = container.querySelector(
      'button'
    ) as HTMLButtonElement | null;
    const page = () =>
      container
        .querySelector('[data-testid="topology-page"]')
        ?.textContent?.trim() ?? '';

    expect(step).toBe(0);
    expect(page()).toBe('Loading messaging topology...');
    expect(window.location.pathname).toBe('/example');

    toggle?.click();
    flushScheduler();

    expect(step).toBe(1);
    expect(container.querySelector('[data-testid="topology-page"]')).toBeNull();

    toggle?.click();
    flushScheduler();
    await settle();

    expect(step).toBe(2);
    expect(window.location.pathname).toBe('/example');
    expect(page()).toBe('Messaging topology');
    expect(
      container.querySelector('[data-theme]')?.getAttribute('data-theme')
    ).toBe('light');
  });
});
