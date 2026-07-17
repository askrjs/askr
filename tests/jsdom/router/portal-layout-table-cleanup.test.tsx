import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { definePortal, type Portal } from '../../../src/runtime/portal';
import type { ComponentInstance } from '../../../src/runtime/component';
import type { ReadableSource } from '../../../src/runtime/readable';
import { currentRoute } from '../../../src/router/activity';
import { navigate } from '../../../src/router/navigate';
import {
  clearRoutes,
  getRoutes,
  group,
  registerRoutes,
  route,
} from '../../../src/router/route';
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

function getPortalSource(
  root: Node,
  portal: Portal
): ReadableSource<unknown> | undefined {
  const portalInstance = Array.from(collectInstances(root)).find(
    (instance) => instance.fn === portal
  );
  return portalInstance?._lastReadSources?.values().next().value;
}

describe('portal cleanup in routed layout and keyed table children', () => {
  let result: ReturnType<typeof createTestContainer>;

  beforeEach(() => {
    result = createTestContainer();
    clearRoutes();
  });

  afterEach(() => {
    result.cleanup();
    clearRoutes();
  });

  it('should use destination route context and keep portal readers stable given a shared layout when navigating repeatedly', async () => {
    const layoutPortal = definePortal();
    const rowPortals = Array.from({ length: 5 }, () => definePortal());
    const renderedLayoutPaths: string[] = [];

    function PortalWriter({
      portal,
      label,
    }: {
      portal: Portal;
      label: string;
    }) {
      return portal.render({
        children: <div data-portal-surface={label}>{label}</div>,
      }) as null;
    }

    function Overlay({ portal, label }: { portal: Portal; label: string }) {
      const PortalHost = portal;
      return (
        <>
          <button>{label}</button>
          <PortalWriter portal={portal} label={label} />
          <PortalHost key={`${label}-portal`} />
        </>
      );
    }

    function LayoutOverlay() {
      return <Overlay portal={layoutPortal} label={'layout'} />;
    }

    function TablePage() {
      return (
        <main data-page={'table'}>
          <table>
            <tbody>
              {rowPortals.map((portal, index) => (
                <tr key={`row-${index}`}>
                  <td>
                    <Overlay portal={portal} label={`row-${index}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </main>
      );
    }

    function PlainPage() {
      return <main data-page={'plain'}>{'plain'}</main>;
    }

    function Layout({ children }: { children?: unknown }) {
      const routeSnapshot = currentRoute();
      renderedLayoutPaths.push(routeSnapshot.path);
      return (
        <div data-layout={'shared'}>
          {routeSnapshot.path === '/table' ? (
            <header>
              <LayoutOverlay />
            </header>
          ) : null}
          {children as never}
          {routeSnapshot.path === '/table' ? <footer>{'footer'}</footer> : null}
        </div>
      );
    }

    registerRoutes(() => {
      group({ layout: Layout }, () => {
        route('/table', TablePage);
        route('/plain', PlainPage);
      });
    });

    window.history.replaceState({}, '', '/plain');
    await createSPA({ root: result.container, routes: getRoutes() });
    flushScheduler();
    flushScheduler();

    renderedLayoutPaths.length = 0;
    navigate('/table');
    flushScheduler();
    flushScheduler();

    expect(renderedLayoutPaths).not.toContain('/plain');

    const layoutSource = getPortalSource(result.container, layoutPortal);
    const rowSources = rowPortals.map((portal) =>
      getPortalSource(result.container, portal)
    );
    expect(layoutSource?._readers?.size).toBe(1);
    expect(rowSources.map((source) => source?._readers?.size)).toEqual([
      1, 1, 1, 1, 1,
    ]);

    for (let cycle = 0; cycle < 4; cycle += 1) {
      renderedLayoutPaths.length = 0;
      navigate('/plain');
      flushScheduler();

      expect(renderedLayoutPaths).not.toContain('/table');
      expect(layoutSource?._readers?.size ?? 0).toBe(0);
      expect(rowSources.map((source) => source?._readers?.size ?? 0)).toEqual([
        0, 0, 0, 0, 0,
      ]);

      renderedLayoutPaths.length = 0;
      navigate('/table');
      flushScheduler();
      flushScheduler();

      expect(renderedLayoutPaths).not.toContain('/plain');
      expect(layoutSource?._readers?.size).toBe(1);
      expect(rowSources.map((source) => source?._readers?.size)).toEqual([
        1, 1, 1, 1, 1,
      ]);
    }
  });
});
