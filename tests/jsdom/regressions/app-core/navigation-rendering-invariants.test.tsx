import {
  resetRouteState,
  currentRouteRegistry,
} from '../../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { cleanupApp, createSPA } from '../../../../src/boot';
import { resource } from '../../../../src/runtime/operations';
import { state } from '../../../../src/runtime/state';
import { navigate } from '../../../../src/router/navigate';
import { allow } from '../../../../src/router/policy';
import {
  currentRoute,
  fallback,
  group,
  index,
  Outlet,
  page,
  route,
} from '../../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../../test-utils/render/test-renderer';
import {
  createControlledDeferred,
  settleAsyncWork,
} from '../../app-flows/helpers';

async function settleNavigation(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await Promise.resolve();
    flushScheduler();
  }
}

function textFor(selector: string, container: HTMLElement): string {
  return container.querySelector(selector)?.textContent?.trim() ?? '';
}

describe('navigation rendering invariants regression coverage', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  it('should preserve page shell nodes while swapping nested Outlet branches', async () => {
    const navItems = ['guide', 'api', 'examples'];

    function ComponentsPage() {
      return (
        <section data-testid="components-page">
          <header data-testid="components-header">{'Components'}</header>
          <aside data-testid="components-nav">
            {navItems.map((item) => (
              <a key={item} data-testid="nav-item" href={`#${item}`}>
                {item}
              </a>
            ))}
          </aside>
          <main data-testid="components-outlet">
            <span data-testid="outlet-prefix">{'before'}</span>
            <Outlet />
            <span data-testid="outlet-suffix">{'after'}</span>
          </main>
        </section>
      );
    }

    function Overview() {
      return (
        <>
          <h2 data-testid="view-title">{'Overview'}</h2>
          {'ready'}
          <p data-testid="view-body">{'Start here'}</p>
        </>
      );
    }

    function Tabs() {
      return (
        <>
          <h2 data-testid="view-title">{'Tabs'}</h2>
          <ul data-testid="tab-list">
            {['Usage', 'Props', 'A11y'].map((label) => (
              <li key={label} data-testid="tab-row">
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </>
      );
    }

    function Missing() {
      return (
        <>
          <h2 data-testid="view-title">{'Missing'}</h2>
          <p data-testid="view-body">{'No component page'}</p>
        </>
      );
    }

    page('/docs/components', ComponentsPage, () => {
      index(Overview);
      route('tabs', Tabs);
      fallback(Missing);
    });

    window.history.replaceState({}, '', '/docs/components');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const pageHost = container.querySelector('[data-testid="components-page"]');
    const outletHost = container.querySelector(
      '[data-testid="components-outlet"]'
    );
    const firstNav = container.querySelector('[data-testid="nav-item"]');

    expect(pageHost).not.toBeNull();
    expect(outletHost).not.toBeNull();
    expect(textFor('[data-testid="view-title"]', container)).toBe('Overview');
    expect(container.querySelectorAll('[data-testid="nav-item"]')).toHaveLength(
      navItems.length
    );

    navigate('/docs/components/tabs');
    await settleNavigation();

    expect(container.querySelector('[data-testid="components-page"]')).toBe(
      pageHost
    );
    expect(container.querySelector('[data-testid="components-outlet"]')).toBe(
      outletHost
    );
    expect(container.querySelector('[data-testid="nav-item"]')).toBe(firstNav);
    expect(textFor('[data-testid="view-title"]', container)).toBe('Tabs');
    expect(container.querySelectorAll('[data-testid="tab-row"]')).toHaveLength(
      3
    );
    expect(textFor('[data-testid="outlet-prefix"]', container)).toBe('before');
    expect(textFor('[data-testid="outlet-suffix"]', container)).toBe('after');

    navigate('/docs/components/unknown/deeper');
    await settleNavigation();

    expect(container.querySelector('[data-testid="components-page"]')).toBe(
      pageHost
    );
    expect(container.querySelector('[data-testid="nav-item"]')).toBe(firstNav);
    expect(textFor('[data-testid="view-title"]', container)).toBe('Missing');
    expect(container.querySelector('[data-testid="tab-list"]')).toBeNull();

    navigate('/docs/components');
    await settleNavigation();

    expect(container.querySelector('[data-testid="components-page"]')).toBe(
      pageHost
    );
    expect(textFor('[data-testid="view-title"]', container)).toBe('Overview');
    expect(container.textContent).not.toContain('No component page');
  });

  it('should update currentRoute query and hash without remounting same-path DOM', async () => {
    function SearchPage() {
      const draft = state('');
      const snapshot = currentRoute();

      return (
        <section data-testid="search-page">
          <label htmlFor="search-draft">{'Draft'}</label>
          <input
            id="search-draft"
            value={draft()}
            onInput={(event: Event) =>
              draft.set((event.target as HTMLInputElement).value)
            }
          />
          <p data-testid="route-snapshot">
            {`${snapshot.query.get('q') ?? ''}|${snapshot.hash}`}
          </p>
        </section>
      );
    }

    route('/search', SearchPage);

    window.history.replaceState({}, '', '/search?q=one#top');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const pageHost = container.querySelector('[data-testid="search-page"]');
    const input = container.querySelector('#search-draft') as HTMLInputElement;

    expect(textFor('[data-testid="route-snapshot"]', container)).toBe(
      'one|#top'
    );

    input.focus();
    input.value = 'local draft';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushScheduler();

    navigate('/search?q=two#details');
    await settleNavigation();

    const nextInput = container.querySelector(
      '#search-draft'
    ) as HTMLInputElement;

    expect(container.querySelector('[data-testid="search-page"]')).toBe(
      pageHost
    );
    expect(nextInput).toBe(input);
    expect(nextInput.value).toBe('local draft');
    expect(document.activeElement).toBe(input);
    expect(textFor('[data-testid="route-snapshot"]', container)).toBe(
      'two|#details'
    );
  });

  it('should keep routed keyed component children after layout state updates and sibling navigation', async () => {
    function Shell({ children }: { children?: unknown }) {
      const compact = state(false);

      return (
        <div
          data-testid="routed-shell"
          data-mode={compact() ? 'compact' : 'full'}
        >
          <button
            id="toggle-shell"
            type="button"
            onClick={() => compact.set((value) => !value)}
          >
            {'Toggle shell'}
          </button>
          <main data-testid="shell-main">{children as never}</main>
        </div>
      );
    }

    function MenuGroup({ name }: { name: string }) {
      return (
        <section data-testid="menu-group" data-name={name}>
          <h2>{name}</h2>
          <button type="button">
            <span>{`${name} a`}</span>
          </button>
          <button type="button">
            <span>{`${name} b`}</span>
          </button>
        </section>
      );
    }

    function AlphaPage() {
      return (
        <>
          <h1 data-testid="route-title">{'Alpha'}</h1>
          {['alpha', 'beta', 'gamma', 'delta'].map((name) => (
            <MenuGroup key={name} name={name} />
          ))}
        </>
      );
    }

    function BetaPage() {
      return (
        <>
          <h1 data-testid="route-title">{'Beta'}</h1>
          <p>{'middle'}</p>
          {['one', 'two', 'three'].map((name) => (
            <MenuGroup key={name} name={name} />
          ))}
          <span>{'tail'}</span>
        </>
      );
    }

    group({ layout: Shell }, () => {
      route('/alpha', AlphaPage);
      route('/beta', BetaPage);
    });

    window.history.replaceState({}, '', '/alpha');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const shell = container.querySelector('[data-testid="routed-shell"]');
    const main = container.querySelector('[data-testid="shell-main"]');
    const toggle = container.querySelector(
      '#toggle-shell'
    ) as HTMLButtonElement;

    expect(textFor('[data-testid="route-title"]', container)).toBe('Alpha');
    expect(
      container.querySelectorAll('[data-testid="menu-group"]')
    ).toHaveLength(4);

    toggle.click();
    flushScheduler();

    expect(container.querySelector('[data-testid="routed-shell"]')).toBe(shell);
    expect(
      container
        .querySelector('[data-testid="routed-shell"]')
        ?.getAttribute('data-mode')
    ).toBe('compact');
    expect(
      container.querySelectorAll('[data-testid="menu-group"]')
    ).toHaveLength(4);

    navigate('/beta');
    await settleNavigation();

    expect(container.querySelector('[data-testid="routed-shell"]')).toBe(shell);
    expect(container.querySelector('[data-testid="shell-main"]')).toBe(main);
    expect(textFor('[data-testid="route-title"]', container)).toBe('Beta');
    expect(
      container.querySelectorAll('[data-testid="menu-group"]')
    ).toHaveLength(3);
    expect(container.textContent).not.toContain('delta');

    (container.querySelector('#toggle-shell') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.querySelector('[data-testid="routed-shell"]')).toBe(shell);
    expect(
      container
        .querySelector('[data-testid="routed-shell"]')
        ?.getAttribute('data-mode')
    ).toBe('compact');
    expect(textFor('[data-testid="route-title"]', container)).toBe('Beta');
    expect(
      container.querySelectorAll('[data-testid="menu-group"]')
    ).toHaveLength(3);

    navigate('/alpha');
    await settleNavigation();

    expect(container.querySelector('[data-testid="routed-shell"]')).toBe(shell);
    expect(textFor('[data-testid="route-title"]', container)).toBe('Alpha');
    expect(
      container.querySelectorAll('[data-testid="menu-group"]')
    ).toHaveLength(4);
    expect(container.textContent).not.toContain('three');
  });

  it('should keep stale async guarded navigation from disturbing the winning route DOM', async () => {
    const slowGuard = createControlledDeferred<ReturnType<typeof allow>>();
    let slowGuardAborted = false;

    function Shell({ children }: { children?: unknown }) {
      return (
        <section data-testid="async-shell">
          <header>{'Async shell'}</header>
          <main>{children as never}</main>
        </section>
      );
    }

    function HomePage() {
      return <p data-testid="home-page">{'home'}</p>;
    }

    function SlowPage() {
      return <p data-testid="slow-page">{'slow'}</p>;
    }

    function FastPage() {
      return (
        <ul data-testid="fast-list">
          {['fast-a', 'fast-b', 'fast-c'].map((label) => (
            <li key={label} data-testid="fast-row">
              {label}
            </li>
          ))}
        </ul>
      );
    }

    group({ layout: Shell }, () => {
      route('/', HomePage);
      route('/slow', SlowPage, {
        policies: [
          ({ signal }) => {
            signal.addEventListener(
              'abort',
              () => {
                slowGuardAborted = true;
              },
              { once: true }
            );
            return slowGuard.promise;
          },
        ],
      });
      route('/fast', FastPage);
    });

    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    navigate('/slow');
    navigate('/fast');
    await settleNavigation();

    const shell = container.querySelector('[data-testid="async-shell"]');
    const fastList = container.querySelector('[data-testid="fast-list"]');

    expect(slowGuardAborted).toBe(true);
    expect(container.querySelector('[data-testid="slow-page"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="fast-row"]')).toHaveLength(
      3
    );

    slowGuard.resolve(allow());
    await settleNavigation();

    expect(container.querySelector('[data-testid="async-shell"]')).toBe(shell);
    expect(container.querySelector('[data-testid="fast-list"]')).toBe(fastList);
    expect(container.querySelector('[data-testid="slow-page"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="fast-row"]')).toHaveLength(
      3
    );
    expect(window.location.pathname).toBe('/fast');
  });

  it('should prevent stale route resources from resurrecting removed mixed branches', async () => {
    const reportRequest = createControlledDeferred<string>();
    let reportSignal: AbortSignal | undefined;

    function Shell({ children }: { children?: unknown }) {
      return (
        <main data-testid="resource-shell">
          <header>{'Resource shell'}</header>
          {children as never}
        </main>
      );
    }

    function ReportsPage() {
      const report = resource<string>(({ signal }) => {
        reportSignal = signal;
        return reportRequest.promise;
      });

      return (
        <>
          <h1 data-testid="route-title">{'Reports'}</h1>
          <section data-testid="report-panel">
            {report.value ?? 'Loading report'}
          </section>
          {['north', 'south'].map((region) => (
            <p key={region} data-testid="report-region">
              {region}
            </p>
          ))}
        </>
      );
    }

    function SettingsPage() {
      return (
        <>
          <h1 data-testid="route-title">{'Settings'}</h1>
          <div data-testid="settings-panel">
            {['profile', 'billing', 'security'].map((item) => (
              <button key={item} type="button">
                {item}
              </button>
            ))}
          </div>
        </>
      );
    }

    group({ layout: Shell }, () => {
      route('/reports', ReportsPage);
      route('/settings', SettingsPage);
    });

    window.history.replaceState({}, '', '/reports');
    await createSPA({ root: container, registry: currentRouteRegistry() });
    flushScheduler();

    const shell = container.querySelector('[data-testid="resource-shell"]');

    expect(textFor('[data-testid="route-title"]', container)).toBe('Reports');
    expect(textFor('[data-testid="report-panel"]', container)).toBe(
      'Loading report'
    );

    navigate('/settings');
    await settleNavigation();

    expect(container.querySelector('[data-testid="resource-shell"]')).toBe(
      shell
    );
    expect(reportSignal?.aborted).toBe(true);
    expect(textFor('[data-testid="route-title"]', container)).toBe('Settings');
    expect(container.querySelector('[data-testid="report-panel"]')).toBeNull();

    reportRequest.resolve('stale report');
    await settleAsyncWork();

    expect(container.querySelector('[data-testid="resource-shell"]')).toBe(
      shell
    );
    expect(textFor('[data-testid="route-title"]', container)).toBe('Settings');
    expect(container.textContent).not.toContain('stale report');
    expect(container.querySelector('[data-testid="report-panel"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="settings-panel"]')
    ).not.toBeNull();
  });
});
