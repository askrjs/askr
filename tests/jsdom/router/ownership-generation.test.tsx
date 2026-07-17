import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createSPA } from '@askrjs/askr/boot';
import { createDataRuntime, createQuery } from '../../../src/data';
import { derive, selector, state, type State } from '../../../src';
import { For } from '../../../src/control';
import { Presence } from '../../../src/foundations/structures';
import { task } from '../../../src/runtime/operations';
import { definePortal, Portal } from '../../../src/runtime/portal';
import {
  defineScope,
  getCurrentInstance,
  readScope,
  type ComponentInstance,
} from '../../../src/runtime';
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

type InstanceHostNode = Node & {
  __ASKR_INSTANCE?: ComponentInstance;
  __ASKR_INSTANCES?: ComponentInstance[];
};

function collectMountedHostMismatches(root: Node): ComponentInstance[] {
  const mismatches = new Set<ComponentInstance>();
  const walker = document.createTreeWalker(root, 0xffffffff);
  let node: Node | null = walker.currentNode;
  while (node) {
    const host = node as InstanceHostNode;
    const instances = new Set(host.__ASKR_INSTANCES ?? []);
    if (host.__ASKR_INSTANCE) instances.add(host.__ASKR_INSTANCE);
    for (const instance of instances) {
      const ownHost = instance.target ?? instance._placeholder;
      if (instance.mounted && ownHost?.isConnected !== true) {
        mismatches.add(instance);
      }
    }
    node = walker.nextNode();
  }
  return Array.from(mismatches);
}

function collectHostInstances(root: Node): Set<ComponentInstance> {
  const instances = new Set<ComponentInstance>();
  const walker = document.createTreeWalker(root, 0xffffffff);
  let node: Node | null = walker.currentNode;
  while (node) {
    const host = node as InstanceHostNode;
    for (const instance of host.__ASKR_INSTANCES ?? []) instances.add(instance);
    if (host.__ASKR_INSTANCE) instances.add(host.__ASKR_INSTANCE);
    node = walker.nextNode();
  }
  return instances;
}

describe('route ownership generations', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const testContainer = createTestContainer();
    container = testContainer.container;
    cleanup = testContainer.cleanup;
    clearRoutes();
  });

  afterEach(() => cleanup());

  it('should detach only the departed query generation across repeated routes', async () => {
    const runtime = createDataRuntime();
    let cleanups = 0;

    const page = (name: string) => () => {
      const query = createQuery({
        runtime,
        key: `route:${name}`,
        initialData: { name },
        fetch: async () => ({ name }),
      });
      task(() => () => {
        cleanups += 1;
      });
      return <p>{query.data?.name}</p>;
    };

    route('/a', page('a'));
    route('/b', page('b'));
    window.history.replaceState({}, '', '/a');
    await createSPA({
      root: container,
      routes: getRoutes(),
      dataRuntime: runtime,
    });
    flushScheduler();
    await Promise.resolve();

    for (let cycle = 0; cycle < 4; cycle += 1) {
      navigate('/b');
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      expect(container.textContent).toBe('b');
      expect(runtime.queryCache.size).toBe(1);

      navigate('/a');
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      expect(container.textContent).toBe('a');
      expect(runtime.queryCache.size).toBe(1);
    }

    expect(cleanups).toBe(8);
  });

  it('should dispose departed fragment, portal, and comment host instances', async () => {
    const routeInstances = new Map<string, Set<ComponentInstance>>();
    const cleanupCounts = new Map<ComponentInstance, number>();

    const recordInstance = (routeName: string): void => {
      const instance = getCurrentInstance();
      expect(instance).not.toBeNull();
      const instances = routeInstances.get(routeName) ?? new Set();
      instances.add(instance!);
      routeInstances.set(routeName, instances);
      task(() => () => {
        cleanupCounts.set(instance!, (cleanupCounts.get(instance!) ?? 0) + 1);
      });
    };

    const createPage = (routeName: string) => {
      const ElementLeaf = () => {
        recordInstance(routeName);
        return <span data-owned-element={routeName}>{routeName}</span>;
      };
      const CommentLeaf = () => {
        recordInstance(routeName);
        return null;
      };
      const FragmentOwner = () => {
        recordInstance(routeName);
        return (
          <>
            <ElementLeaf />
            <CommentLeaf />
          </>
        );
      };
      const PortalSurface = () => {
        recordInstance(routeName);
        return (
          <>
            <aside data-owned-portal={routeName}>{routeName}</aside>
            <CommentLeaf />
          </>
        );
      };
      const PortalWriter = () => {
        recordInstance(routeName);
        return (
          <Portal>
            <PortalSurface />
          </Portal>
        );
      };

      return () => (
        <>
          <FragmentOwner />
          <ElementLeaf />
          <CommentLeaf />
          <PortalWriter />
        </>
      );
    };

    const SharedLayout = ({ children }: { children?: unknown }) => (
      <main data-generation-layout="shared">{children as never}</main>
    );
    registerRoutes(() => {
      group({ layout: SharedLayout }, () => {
        route('/a', createPage('a'));
        route('/b', createPage('b'));
      });
    });
    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    let departed = new Set(
      Array.from(routeInstances.get('a') ?? []).filter(
        (instance) => instance.mounted
      )
    );
    const generationSize = departed.size;
    expect(generationSize).toBeGreaterThanOrEqual(8);
    expect(container.querySelector('[data-owned-element="a"]')).not.toBeNull();
    expect(container.querySelector('[data-owned-portal="a"]')).not.toBeNull();
    expect(collectMountedHostMismatches(container)).toEqual([]);

    for (let cycle = 0; cycle < 6; cycle += 1) {
      const routeName = cycle % 2 === 0 ? 'b' : 'a';
      navigate(`/${routeName}`);
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();

      expect(
        container.querySelector(`[data-owned-element="${routeName}"]`)
      ).not.toBeNull();
      expect(
        container.querySelector(`[data-owned-portal="${routeName}"]`)
      ).not.toBeNull();
      expect(collectMountedHostMismatches(container)).toEqual([]);
      for (const instance of departed) {
        expect(instance.mounted).toBe(false);
        expect(instance.notifyUpdate).toBeNull();
        expect(cleanupCounts.get(instance)).toBe(1);
      }

      const current = new Set(
        Array.from(routeInstances.get(routeName) ?? []).filter(
          (instance) => instance.mounted
        )
      );
      expect(current.size).toBe(generationSize);
      departed = current;
    }
  });

  it('should keep connected host metadata aligned across same-handler route branches', async () => {
    const OuterScope = defineScope('outer');
    const InnerScope = defineScope('inner');
    const routeInstances = new Map<string, Set<ComponentInstance>>();

    const recordInstance = (routeName: string): void => {
      const instance = getCurrentInstance()!;
      const instances = routeInstances.get(routeName) ?? new Set();
      instances.add(instance);
      routeInstances.set(routeName, instances);
    };

    const createBranch = (routeName: string) => {
      const ContextLeaf = () => {
        recordInstance(routeName);
        return (
          <div data-context-provider={routeName}>
            {`${readScope(OuterScope)}:${readScope(InnerScope)}`}
          </div>
        );
      };
      const CommentLeaf = () => {
        recordInstance(routeName);
        return null;
      };
      const PortalSurface = () => {
        recordInstance(routeName);
        return <aside data-branch-portal={routeName}>{routeName}</aside>;
      };
      const PortalWriter = () => {
        recordInstance(routeName);
        return (
          <Portal>
            <PortalSurface />
          </Portal>
        );
      };
      const Wrapper = () => {
        recordInstance(routeName);
        return (
          <>
            <ContextLeaf />
            <CommentLeaf />
            <PortalWriter />
          </>
        );
      };

      return () => {
        recordInstance(routeName);
        return (
          <OuterScope value={`${routeName}-outer`}>
            <InnerScope value={`${routeName}-inner`}>
              <Wrapper />
            </InnerScope>
          </OuterScope>
        );
      };
    };

    const BranchA = createBranch('a');
    const BranchB = createBranch('b');
    const SamePage = () =>
      currentRoute().path === '/same/a' ? <BranchA /> : <BranchB />;
    const SharedLayout = ({ children }: { children?: unknown }) => (
      <main data-same-handler-layout="shared">{children as never}</main>
    );

    registerRoutes(() => {
      group({ layout: SharedLayout }, () => {
        route('/same/a', SamePage);
        route('/same/b', SamePage);
      });
    });
    window.history.replaceState({}, '', '/same/a');
    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    expect(collectMountedHostMismatches(container)).toEqual([]);
    for (let cycle = 0; cycle < 8; cycle += 1) {
      const routeName = cycle % 2 === 0 ? 'b' : 'a';
      const departedName = routeName === 'a' ? 'b' : 'a';
      const departed = Array.from(
        routeInstances.get(departedName) ?? []
      ).filter((instance) => instance.mounted);

      navigate(`/same/${routeName}`);
      flushScheduler();

      expect(
        container.querySelector(`[data-context-provider="${routeName}"]`)
      ).not.toBeNull();
      expect(
        container.querySelector(`[data-branch-portal="${routeName}"]`)
      ).not.toBeNull();
      expect(collectMountedHostMismatches(container)).toEqual([]);
      for (const instance of departed) {
        expect(instance.mounted).toBe(false);
        expect(instance.notifyUpdate).toBeNull();
      }
    }
  });

  it('should recursively dispose a shared-layout conditional wrapper chain', async () => {
    type MenuContext = {
      open: boolean;
      setOpen: (open: boolean) => void;
    };

    const MenuScope = defineScope<MenuContext | null>(null);
    const ContentScope = defineScope('content');
    const LayoutScope = defineScope('layout');
    const PersistentPortal = definePortal();
    let shared!: State<number> & {
      _readers?: Map<ComponentInstance, unknown>;
    };

    const ReactiveComment = () => {
      shared();
      return null;
    };
    const FocusScope = ({ children }: { children?: unknown }) =>
      children as never;
    const DismissableLayer = ({ children }: { children?: unknown }) =>
      children as never;
    const MenuSurface = () => (
      <div data-menu-content="true">
        <ReactiveComment />
      </div>
    );
    const MenuContent = () => {
      const root = readScope(MenuScope)!;
      return PersistentPortal.render({
        children: (
          <Presence present={root.open}>
            <FocusScope>
              <DismissableLayer>
                <MenuSurface />
              </DismissableLayer>
            </FocusScope>
          </Presence>
        ),
      });
    };
    const MenuTrigger = () => {
      const root = readScope(MenuScope)!;
      return (
        <button data-profile-trigger="true" onClick={() => root.setOpen(true)}>
          trigger
        </button>
      );
    };
    const DropdownMenu = ({ children }: { children?: unknown }) => {
      const open = state(false);
      return (
        <MenuScope value={{ open: open(), setOpen: open.set }}>
          <ContentScope value="content">
            {children as never}
            <PersistentPortal key="profile-portal" />
          </ContentScope>
        </MenuScope>
      );
    };
    const ProfileMenu = () => (
      <DropdownMenu>
        <MenuTrigger />
        <MenuContent />
      </DropdownMenu>
    );
    const AuthNavControl = () => {
      currentRoute();
      return <ProfileMenu />;
    };
    const Header = () => (
      <header data-conditional-header="true">
        <AuthNavControl />
      </header>
    );
    const StableReader = () => {
      shared();
      return null;
    };
    const LayoutSurface = ({ children }: { children?: unknown }) => {
      shared = state(0) as typeof shared;
      const path = currentRoute().path;
      return (
        <div data-conditional-layout="true">
          {path.startsWith('/docs') ? null : <Header />}
          {children as never}
          <StableReader />
        </div>
      );
    };
    const SharedLayout = ({ children }: { children?: unknown }) => (
      <LayoutScope value="layout">
        <LayoutSurface>{children as never}</LayoutSurface>
      </LayoutScope>
    );
    const DocsProfile = () => (
      <MenuScope value={{ open: false, setOpen: () => undefined }}>
        <ContentScope value="docs-content">
          <div data-docs-profile="true">
            <PersistentPortal key="profile-portal" />
          </div>
        </ContentScope>
      </MenuScope>
    );

    registerRoutes(() => {
      group({ layout: SharedLayout }, () => {
        route('/app', () => <main>app</main>);
        route('/metrics', () => <main>metrics</main>);
        route('/settings', () => <main>settings</main>);
        route('/logs', () => <main>logs</main>);
        route('/docs', () => (
          <main>
            docs
            <DocsProfile />
          </main>
        ));
      });
    });
    window.history.replaceState({}, '', '/logs');
    const routes = getRoutes();
    await createSPA({ root: container, routes });
    flushScheduler();

    expect(collectMountedHostMismatches(container)).toEqual([]);
    navigate('/metrics');
    flushScheduler();
    expect(collectMountedHostMismatches(container)).toEqual([]);

    const trigger = container.querySelector(
      '[data-profile-trigger="true"]'
    ) as HTMLButtonElement;
    trigger.click();
    flushScheduler();

    expect(
      container.querySelector('[data-menu-content="true"]')
    ).not.toBeNull();
    expect(collectMountedHostMismatches(container)).toEqual([]);
    for (const instance of collectHostInstances(container)) {
      if (instance.fn === AuthNavControl || instance.fn === ProfileMenu) {
        expect(instance.target?.isConnected).toBe(true);
      }
    }

    navigate('/settings');
    flushScheduler();
    expect(collectMountedHostMismatches(container)).toEqual([]);

    const header = container.querySelector('[data-conditional-header]')!;
    const departed = collectHostInstances(header);
    const departedPortal = Array.from(departed).find(
      (instance) => instance.fn === PersistentPortal
    );
    const portalSource = departedPortal?._lastReadSources
      ?.values()
      .next().value;
    expect(departed.size).toBeGreaterThanOrEqual(6);
    expect(departedPortal).toBeDefined();
    expect(portalSource?._readers?.size).toBe(1);
    expect(shared._readers?.size).toBe(2);

    navigate('/docs');
    flushScheduler();

    expect(container.querySelector('[data-conditional-header]')).toBeNull();
    expect(shared._readers?.size).toBe(2);
    expect(portalSource?._readers?.size).toBe(1);
    expect(portalSource?._readers?.has(departedPortal!)).toBe(false);
    for (const instance of departed) {
      expect(instance.mounted).toBe(false);
      expect(instance.notifyUpdate).toBeNull();
      expect(shared._readers?.has(instance) ?? false).toBe(false);
    }
  });

  it('should isolate derive, selector, and For hooks across repeated route generations', async () => {
    type RouteControl = {
      value: State<number>;
      rows: State<string[]>;
    };
    const controls = new Map<string, RouteControl>();

    const page = (name: string, initialValue: number) => () => {
      const value = state(initialValue);
      const doubled = derive(() => value() * 2);
      const isSelected = selector(value);
      const rows = state([`${name}-one`, `${name}-two`]);
      controls.set(name, { value, rows });

      return (
        <section
          data-route={name}
          data-derived={() => String(doubled())}
          data-initial-selected={() => String(isSelected(initialValue))}
          data-next-selected={() => String(isSelected(initialValue + 1))}
        >
          <For each={rows} by={(row) => row}>
            {(row) => <p>{row}</p>}
          </For>
        </section>
      );
    };

    route('/a', page('a', 10));
    route('/b', page('b', 20));
    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    let departed = controls.get('a')!;

    for (let cycle = 0; cycle < 6; cycle += 1) {
      const name = cycle % 2 === 0 ? 'b' : 'a';
      const initialValue = name === 'a' ? 10 : 20;
      navigate(`/${name}`);
      flushScheduler();

      const current = controls.get(name)!;
      expect(current).not.toBe(departed);
      const subject = container.querySelector(`[data-route="${name}"]`)!;
      expect(subject.getAttribute('data-derived')).toBe(
        String(initialValue * 2)
      );
      expect(subject.getAttribute('data-initial-selected')).toBe('true');
      expect(subject.getAttribute('data-next-selected')).toBe('false');
      expect(
        Array.from(subject.querySelectorAll('p'), (row) => row.textContent)
      ).toEqual([`${name}-one`, `${name}-two`]);

      departed.value.set(999);
      departed.rows.set(['departed']);
      flushScheduler();

      expect(subject.getAttribute('data-derived')).toBe(
        String(initialValue * 2)
      );
      expect(subject.getAttribute('data-initial-selected')).toBe('true');
      expect(subject.getAttribute('data-next-selected')).toBe('false');
      expect(
        Array.from(subject.querySelectorAll('p'), (row) => row.textContent)
      ).toEqual([`${name}-one`, `${name}-two`]);

      current.value.set(initialValue + 1);
      flushScheduler();
      expect(subject.getAttribute('data-derived')).toBe(
        String((initialValue + 1) * 2)
      );
      expect(subject.getAttribute('data-initial-selected')).toBe('false');
      expect(subject.getAttribute('data-next-selected')).toBe('true');

      current.rows.set([`${name}-updated`, `${name}-added`]);
      flushScheduler();
      expect(
        Array.from(subject.querySelectorAll('p'), (row) => row.textContent)
      ).toEqual([`${name}-updated`, `${name}-added`]);

      departed = current;
    }
  });

  it('should hand off keyed and fragment For boundaries in a retained route host', async () => {
    type Row = { id: string | number; label: string };
    type RouteControl = {
      keyedRows: State<Row[]>;
      fragmentRows: State<Row[]>;
    };
    const controls = new Map<string, RouteControl>();

    const page = (name: string) => () => {
      const keyedRows = state<Row[]>([
        { id: 1, label: `${name}-one` },
        { id: 2, label: `${name}-two` },
      ]);
      const fragmentRows = state<Row[]>([
        { id: `${name}-first`, label: `${name}-fragment-one` },
        { id: `${name}-second`, label: `${name}-fragment-two` },
      ]);
      controls.set(name, { keyedRows, fragmentRows });

      return (
        <section data-for-route={name}>
          <div data-keyed-list={name}>
            <For each={keyedRows} by={(row) => row.id}>
              {(row) => <p data-keyed-row={String(row.id)}>{row.label}</p>}
            </For>
          </div>
          <div data-fragment-list={name}>
            <For each={fragmentRows} by={(row) => row.id}>
              {(row) => (
                <>
                  <span data-fragment-row={String(row.id)}>{row.label}</span>
                  <small>{`detail:${row.label}`}</small>
                </>
              )}
            </For>
          </div>
        </section>
      );
    };

    route('/a', page('a'));
    route('/b', page('b'));
    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    const keyedNodes = Array.from(
      container.querySelectorAll('[data-keyed-row]')
    );
    let departed = controls.get('a')!;

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const name = cycle % 2 === 0 ? 'b' : 'a';
      navigate(`/${name}`);
      flushScheduler();

      const current = controls.get(name)!;
      const subject = container.querySelector(`[data-for-route="${name}"]`)!;
      expect(Array.from(subject.querySelectorAll('[data-keyed-row]'))).toEqual(
        keyedNodes
      );
      expect(
        Array.from(
          subject.querySelectorAll('[data-keyed-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-one`, `${name}-two`]);
      expect(
        Array.from(
          subject.querySelectorAll('[data-fragment-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-fragment-one`, `${name}-fragment-two`]);

      departed.keyedRows.set([{ id: 1, label: 'departed-keyed' }]);
      departed.fragmentRows.set([
        { id: 'departed-fragment', label: 'departed-fragment' },
      ]);
      flushScheduler();
      expect(
        Array.from(
          subject.querySelectorAll('[data-keyed-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-one`, `${name}-two`]);
      expect(
        Array.from(
          subject.querySelectorAll('[data-fragment-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-fragment-one`, `${name}-fragment-two`]);

      current.keyedRows.set([
        { id: 1, label: `${name}-one-updated` },
        { id: 2, label: `${name}-two-updated` },
      ]);
      current.fragmentRows.set([
        { id: `${name}-third`, label: `${name}-fragment-updated` },
      ]);
      flushScheduler();
      expect(
        Array.from(
          subject.querySelectorAll('[data-keyed-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-one-updated`, `${name}-two-updated`]);
      expect(
        Array.from(
          subject.querySelectorAll('[data-fragment-row]'),
          (row) => row.textContent
        )
      ).toEqual([`${name}-fragment-updated`]);

      departed = current;
    }

    cleanup();
    cleanup = () => {};
    departed.keyedRows.set([{ id: 1, label: 'after-unmount' }]);
    departed.fragmentRows.set([
      { id: 'after-unmount', label: 'after-unmount' },
    ]);
    flushScheduler();
    expect(container.isConnected).toBe(false);
  });

  it('should restore the previous For boundary owner when a destination fails', async () => {
    let stableRows!: State<string[]>;
    const Broken = () => {
      throw new Error('For destination failed');
    };

    route('/stable', () => {
      stableRows = state(['stable']);
      return (
        <section data-for-rollback="stable">
          <div data-for-rollback-list="stable">
            <For each={stableRows} by={(row) => row}>
              {(row) => <p>{row}</p>}
            </For>
          </div>
          <span>ready</span>
        </section>
      );
    });
    route('/broken', () => {
      const candidateRows = state(['candidate']);
      return (
        <section data-for-rollback="broken">
          <div data-for-rollback-list="broken">
            <For each={candidateRows} by={(row) => row}>
              {(row) => <p>{row}</p>}
            </For>
          </div>
          <Broken />
        </section>
      );
    });

    window.history.replaceState({}, '', '/stable');
    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();
    const stableList = container.querySelector('[data-for-rollback-list]')!;
    const stableRow = stableList.firstElementChild;

    expect(() => navigate('/broken')).toThrow('For destination failed');
    expect(window.location.pathname).toBe('/stable');
    expect(
      container
        .querySelector('[data-for-rollback]')
        ?.getAttribute('data-for-rollback')
    ).toBe('stable');
    expect(container.querySelector('[data-for-rollback-list]')).toBe(
      stableList
    );
    expect(stableList.firstElementChild).toBe(stableRow);
    expect(stableList.textContent).toBe('stable');

    stableRows.set(['stable-updated']);
    flushScheduler();
    expect(stableList.textContent).toBe('stable-updated');
  });

  it('should keep departed readable updates from rerendering the destination', async () => {
    let departed: State<number> | undefined;
    let destinationRenders = 0;

    route('/a', () => {
      departed = state(0);
      return <p>{String(departed())}</p>;
    });
    route('/b', () => {
      destinationRenders += 1;
      return <p>destination</p>;
    });

    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();
    navigate('/b');
    flushScheduler();

    departed?.set(1);
    flushScheduler();

    expect(container.textContent).toBe('destination');
    expect(destinationRenders).toBe(1);
  });

  it('should not turn a departed cleanup update into a destination rerender', async () => {
    let departed: State<number> | undefined;
    let destinationRenders = 0;

    route('/a', () => {
      departed = state(0);
      const instance = getCurrentInstance()!;
      (instance.cleanupFns ??= []).push(() => departed!.set(1));
      return <p>{String(departed())}</p>;
    });
    route('/b', () => {
      destinationRenders += 1;
      return <p>destination</p>;
    });

    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();
    navigate('/b');
    flushScheduler();

    expect(container.textContent).toBe('destination');
    expect(destinationRenders).toBe(1);
  });

  it('should settle an old async task cleanup outside the destination generation', async () => {
    let resolveTask!: (cleanup: () => void) => void;
    let oldTaskCleanups = 0;

    route('/a', () => {
      task(
        () =>
          new Promise<() => void>((resolve) => {
            resolveTask = resolve;
          })
      );
      return <p>source</p>;
    });
    route('/b', () => <p>destination</p>);

    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    navigate('/b');
    flushScheduler();
    resolveTask(() => {
      oldTaskCleanups += 1;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(container.textContent).toBe('destination');
    expect(oldTaskCleanups).toBe(1);
  });

  it('should dispose null component hosts from every departed route generation', async () => {
    type CommentHost = Comment & {
      __ASKR_INSTANCE?: { mounted: boolean };
    };
    const componentCommentHosts = (): CommentHost[] => {
      const hosts: CommentHost[] = [];
      const walker = document.createTreeWalker(container, 128);
      let current = walker.nextNode();
      while (current) {
        const host = current as CommentHost;
        if (host.__ASKR_INSTANCE) hosts.push(host);
        current = walker.nextNode();
      }
      return hosts;
    };

    route('/a', () => <p>route a</p>);
    route('/b', () => <p>route b</p>);
    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const previousHosts = componentCommentHosts().map((host) => ({
        host,
        instance: host.__ASKR_INSTANCE!,
      }));
      expect(previousHosts.length).toBeGreaterThan(0);

      navigate(cycle % 2 === 0 ? '/b' : '/a');
      flushScheduler();

      const departedHosts = previousHosts.filter(
        ({ host }) => !host.isConnected
      );
      expect(departedHosts.length).toBeGreaterThan(0);
      for (const { host, instance } of departedHosts) {
        expect(host.__ASKR_INSTANCE).toBeUndefined();
        expect(instance.mounted).toBe(false);
      }
    }
  });

  it('should preserve the destination portal when the departed generation used the same root owner', async () => {
    const page = (name: string) => () => {
      Portal({
        children: <aside data-route-portal={name}>{name}</aside>,
      });
      return <p>{`route ${name}`}</p>;
    };

    route('/a', page('a'));
    route('/b', page('b'));
    window.history.replaceState({}, '', '/a');
    await createSPA({ root: container, routes: getRoutes() });
    flushScheduler();

    expect(container.querySelector('[data-route-portal="a"]')).not.toBeNull();

    navigate('/b');
    flushScheduler();

    expect(container.textContent).toContain('route b');
    expect(container.querySelector('[data-route-portal="a"]')).toBeNull();
    expect(container.querySelector('[data-route-portal="b"]')).not.toBeNull();
  });
});
