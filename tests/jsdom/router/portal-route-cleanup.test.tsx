import { resetRouteState } from '../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { definePortal } from '../../../src/runtime/portal';
import { state } from '../../../src/runtime/state';
import type { ComponentInstance } from '../../../src/runtime/component';
import type { ReadableSource } from '../../../src/runtime/readable';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, group, route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type InstanceHost = Node & {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
};

function collectInstances(root: Node): Set<ComponentInstance> {
  const instances = new Set<ComponentInstance>();
  const walker = document.createTreeWalker(root, 0xffffffff);
  let node: Node | null = walker.currentNode;
  while (node) {
    const host = node as InstanceHost;
    if (host.__ASKR_INSTANCE) instances.add(host.__ASKR_INSTANCE);
    for (const instance of host.__ASKR_INSTANCES ?? []) instances.add(instance);
    node = walker.nextNode();
  }
  return instances;
}

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
    let pageVersion = 0;

    function PortalWriter() {
      return OverlayPortal.render({
        children: (
          <div data-overlay-content={'true'}>{`overlay ${pageVersion}`}</div>
        ),
      }) as null;
    }

    function PortalPage() {
      const version = state(0);
      pageVersion = version();
      bumpPage = () => version.set((value) => value + 1);
      return (
        <section data-page={'portal'}>
          <OverlayPortal />
          <PortalWriter />
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

    let source: ReadableSource<unknown> | undefined;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const portalInstance = Array.from(
        collectInstances(result.container)
      ).find((instance) => instance.fn === OverlayPortal);
      expect(portalInstance).toBeDefined();
      expect(portalInstance?.mounted).toBe(true);

      const [currentSource] = portalInstance?._lastReadSources ?? [];
      source ??= currentSource;
      expect(currentSource).toBe(source);
      expect(source?._readers?.size).toBe(1);

      bumpPage();
      flushScheduler();
      flushScheduler();
      expect(source?._readers?.size).toBe(1);
      (portalInstance!.cleanupFns ??= []).push(() => {
        cleanups += 1;
      });

      navigate('/plain');
      flushScheduler();

      expect(
        result.container.querySelector('[data-page="plain"]')
      ).not.toBeNull();
      expect(portalInstance?.mounted).toBe(false);
      expect(source?._readers?.has(portalInstance!)).toBe(false);
      expect(source?._readers?.size ?? 0).toBe(0);

      navigate('/portal');
      flushScheduler();
      flushScheduler();
    }

    expect(cleanups).toBe(4);
  });
});
