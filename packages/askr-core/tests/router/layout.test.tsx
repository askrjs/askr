import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { createSPA } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { navigate } from '../../src/router/navigate';
import { clearRoutes, group, route, getManifest } from '../../src/router/route';

describe('layout scoping (ROUTER)', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const t = createTestContainer();
    container = t.container;
    cleanup = t.cleanup;
    clearRoutes();
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

    await createSPA({ root: container, manifest: getManifest() });
    navigate('/home');
    await flushScheduler();

    expect(container.querySelector('.shell')).not.toBeNull();
    expect(container.querySelector('.home')).not.toBeNull();
    expect(container.querySelector('.home')?.textContent).toBe('Home');
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

    await createSPA({ root: container, manifest: getManifest() });
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

    await createSPA({ root: container, manifest: getManifest() });
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

    const manifest = getManifest();
    const record = manifest.records.find((r) => r.path === '/page');

    expect(record).not.toBeUndefined();
    expect(record!.layoutChain).toHaveLength(1);
    expect(record!.layoutChain[0].component).toBe(AppLayout);
    expect(record!.component).toBe(Page);
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

    await createSPA({ root: container, manifest: getManifest() });

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
});
