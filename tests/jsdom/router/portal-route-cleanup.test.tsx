import { resetRouteState } from '../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { definePortal } from '../../../src/foundations';
import { state } from '../../../src/index';
import { task } from '../../../src/resources';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, group, route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('portal route cleanup', () => {
  let result: ReturnType<typeof createTestContainer>;

  beforeEach(() => {
    result = createTestContainer();
    resetRouteState();
  });

  afterEach(() => {
    result.cleanup();
    resetRouteState();
  });

  it('should detach persistent portal readers from departed shared-layout routes', async () => {
    const OverlayPortal = definePortal();
    let cleanups = 0;
    let bumpPage = () => {};

    function PortalWriter({ version }: { version: number }) {
      return OverlayPortal.render({
        children: (
          <div data-overlay-content={'true'}>{`overlay ${version}`}</div>
        ),
      }) as null;
    }

    function OverlayHost() {
      task(() => () => {
        cleanups += 1;
      });
      return <OverlayPortal />;
    }

    function PortalPage() {
      const version = state(0);
      bumpPage = () => version.set((value) => value + 1);
      return (
        <section data-page={'portal'}>
          <OverlayHost />
          <PortalWriter version={version()} />
        </section>
      );
    }

    function PlainPage() {
      return <section data-page={'plain'}>{'plain'}</section>;
    }

    function Layout({ children }: { children?: unknown }) {
      return <main data-layout={'shared'}>{children as never}</main>;
    }

    const registry = createRouteRegistry(() => {
      group({ layout: Layout }, () => {
        route('/portal', PortalPage);
        route('/plain', PlainPage);
      });
    });

    window.history.replaceState({}, '', '/portal');
    await createSPA({
      root: result.container,
      registry,
    });
    flushScheduler();
    flushScheduler();

    const overlays = () =>
      result.container.querySelectorAll('[data-overlay-content]');
    for (let cycle = 0; cycle < 4; cycle += 1) {
      expect(overlays()).toHaveLength(1);
      expect(overlays()[0].textContent).toBe('overlay 0');

      bumpPage();
      flushScheduler();
      flushScheduler();
      expect(overlays()).toHaveLength(1);
      expect(overlays()[0].textContent).toBe('overlay 1');

      navigate('/plain');
      flushScheduler();

      expect(
        result.container.querySelector('[data-page="plain"]')
      ).not.toBeNull();
      expect(overlays()).toHaveLength(0);
      expect(cleanups).toBe(cycle + 1);

      navigate('/portal');
      flushScheduler();
      flushScheduler();
    }

    expect(cleanups).toBe(4);
  });
});
