import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { onRouteChange } from '../../../src/router/activity';
import { createSPA } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { navigate } from '../../../src/router/navigate';
import {
  fallback,
  group,
  index,
  Outlet,
  page,
  route,
} from '../../../src/router/route';

describe('layout scoping (ROUTER)', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const t = createTestContainer();
    container = t.container;
    cleanup = t.cleanup;
    resetRouteState();
  });

  afterEach(() => {
    cleanup();
  });

  it('should wrap child routes in the declared layout', async () => {
    const AppLayout = ({ children }: { children?: unknown }) => (
      <div class="shell">{children as never}</div>
    );
    const HomePage = () => <span class="home">Home</span>;

    group({ layout: AppLayout }, () => {
      route('/home', HomePage);
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    navigate('/home');
    await flushScheduler();

    expect(container.querySelector('.shell')).not.toBeNull();
    expect(container.querySelector('.home')).not.toBeNull();
    expect(container.querySelector('.home')?.textContent).toBe('Home');
  });

  it('should publish committed route changes from a persistent layout', async () => {
    const events: string[] = [];
    const AppLayout = ({ children }: { children?: unknown }) => {
      onRouteChange((current, previous) => {
        events.push(`change:${current.path}:${previous?.path ?? ''}`);
        return () => events.push(`cleanup:${current.path}`);
      });
      return <div class="shell">{children as never}</div>;
    };

    group({ layout: AppLayout }, () => {
      route('/first', () => <span>first</span>);
      route('/second', () => <span>second</span>);
    });

    window.history.replaceState({}, '', '/first');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();
    navigate('/second');
    await flushScheduler();

    expect(events).toEqual(['change:/second:/first']);
    navigate('/first');
    await flushScheduler();
    expect(events).toEqual([
      'change:/second:/first',
      'cleanup:/second',
      'change:/first:/second',
    ]);
  });

  it('should not apply layout to routes declared outside the scope', async () => {
    const AppLayout = ({ children }: { children?: unknown }) => (
      <div class="shell">{children as never}</div>
    );
    const Bare = () => <div class="bare">bare</div>;

    route('/bare', Bare);

    group({ layout: AppLayout }, () => {
      route('/wrapped', () => <div class="inner">inner</div>);
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    navigate('/bare');
    await flushScheduler();

    expect(container.querySelector('.shell')).toBeNull();
    expect(container.querySelector('.bare')).not.toBeNull();
  });

  it('should apply nested layout chains correctly', async () => {
    const Outer = ({ children }: { children?: unknown }) => (
      <div class="outer">{children as never}</div>
    );
    const Inner = ({ children }: { children?: unknown }) => (
      <div class="inner">{children as never}</div>
    );
    const Page = () => <span class="page">page</span>;

    group({ layout: Outer }, () => {
      group({ layout: Inner }, () => {
        route('/nested', Page);
      });
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    navigate('/nested');
    await flushScheduler();

    // Outer wraps Inner which wraps Page
    const outer = container.querySelector('.outer');
    const inner = container.querySelector('.inner');
    const page = container.querySelector('.page');

    expect(outer).not.toBeNull();
    expect(inner).not.toBeNull();
    expect(page?.textContent).toBe('page');
    expect(outer?.contains(inner)).toBe(true);
    expect(inner?.contains(page)).toBe(true);
  });

  it('should record layout chain metadata in the manifest', () => {
    const AppLayout = ({ children }: { children?: unknown }) => children;
    const Page = () => null;

    group({ layout: AppLayout }, () => {
      route('/page', Page);
    });

    const manifest = currentRouteManifest();
    const record = manifest.records.find((r) => r.path === '/page');

    expect(record).not.toBeUndefined();
    expect(record!.layoutChain).toHaveLength(1);
    expect(record!.layoutChain[0].component).toBe(AppLayout);
    expect(record!.component).toBe(Page);
  });

  it('should ignore imperative DOM node layout output', async () => {
    const imperativeNode = document.createElement('div');
    imperativeNode.id = 'imperative-layout-output';
    imperativeNode.textContent = 'Imperative layout';

    const AppLayout = () => imperativeNode as unknown as null;
    const Page = () => <span class="page">page</span>;

    group({ layout: AppLayout }, () => {
      route('/layout-imperative', Page);
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    navigate('/layout-imperative');
    await flushScheduler();

    expect(container.querySelector('#imperative-layout-output')).toBeNull();
    expect(container.querySelector('.page')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('should preserve shared layout DOM across navigations', async () => {
    const AppLayout = ({ children }: { children?: unknown }) => (
      <div class="layout">{children as never}</div>
    );
    const PageA = () => <div class="inner">A</div>;
    const PageB = () => <div class="inner">B</div>;

    group({ layout: AppLayout }, () => {
      route('/layout/a', PageA);
      route('/layout/b', PageB);
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });

    navigate('/layout/a');
    await flushScheduler();

    const layoutEl1 = container.querySelector('.layout') as HTMLElement;
    expect(layoutEl1).not.toBeNull();
    expect(container.querySelector('.inner')?.textContent).toBe('A');

    navigate('/layout/b');
    await flushScheduler();

    const layoutEl2 = container.querySelector('.layout') as HTMLElement;
    expect(layoutEl2).toBe(layoutEl1); // same DOM node preserved
    expect(container.querySelector('.inner')?.textContent).toBe('B');
  });

  it('should preserve page input focus during state updates inside a layout-wrapped route', async () => {
    const AppLayout = ({ children }: { children?: unknown }) => (
      <div class="layout">{children as never}</div>
    );

    const ExamplePage = () => {
      const name = state('');

      return (
        <div class="showcase-section">
          <div class="example-controls">
            <button type="button">Bold</button>
            <input
              id="name"
              value={name()}
              onInput={(event: Event) =>
                name.set((event.target as HTMLInputElement).value)
              }
            />
          </div>
          <p id="preview">
            {name() ? `Hello, ${name()}!` : 'Type something above...'}
          </p>
        </div>
      );
    };

    group({ layout: AppLayout }, () => {
      route('/example', ExamplePage);
    });

    window.history.replaceState({}, '', '/example');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const input = container.querySelector('#name') as HTMLInputElement;
    const preview = container.querySelector('#preview');

    input.focus();
    input.value = 'abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    const nextInput = container.querySelector('#name') as HTMLInputElement;
    expect(nextInput).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(preview?.textContent).toBe('Hello, abc!');
  });

  it('should render page hosts through Outlet with relative child routes', async () => {
    const ComponentsPage = () => (
      <section class="components-page">
        <header class="components-header">Components</header>
        <div class="components-content">
          <Outlet />
        </div>
      </section>
    );
    const Overview = () => <p class="components-view">overview</p>;
    const Tabs = () => <p class="components-view">tabs</p>;

    page('/docs/components', ComponentsPage, () => {
      index(Overview);
      route('tabs', Tabs);
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });

    navigate('/docs/components');
    await flushScheduler();

    expect(container.querySelector('.components-page')).not.toBeNull();
    expect(container.querySelector('.components-header')?.textContent).toBe(
      'Components'
    );
    expect(container.querySelector('.components-view')?.textContent).toBe(
      'overview'
    );

    navigate('/docs/components/tabs');
    await flushScheduler();

    expect(container.querySelector('.components-page')).not.toBeNull();
    expect(container.querySelector('.components-view')?.textContent).toBe(
      'tabs'
    );
  });

  it('should render page-local fallback content inside the page shell', async () => {
    const ComponentsPage = () => (
      <section class="components-page">
        <header class="components-header">Components</header>
        <div class="components-content">
          <Outlet />
        </div>
      </section>
    );
    const Overview = () => <p class="components-view">overview</p>;
    const Missing = () => <p class="components-view">missing</p>;

    page('/docs/components', ComponentsPage, () => {
      index(Overview);
      fallback(Missing);
    });

    fallback(() => <p class="root-missing">root missing</p>);

    await createSPA({ root: container, registry: currentRouteRegistry() });

    navigate('/docs/components/unknown/deeper');
    await flushScheduler();

    expect(container.querySelector('.components-page')).not.toBeNull();
    expect(container.querySelector('.components-header')?.textContent).toBe(
      'Components'
    );
    expect(container.querySelector('.components-view')?.textContent).toBe(
      'missing'
    );
    expect(container.querySelector('.root-missing')).toBeNull();
  });
});
