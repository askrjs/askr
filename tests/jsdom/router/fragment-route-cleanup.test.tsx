import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createSPA, state } from '../../../src';
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

function ChartsPage() {
  const scenario = state('launch');
  const animate = state(true);

  return (
    <>
      <section data-route-section="charts-header">Charts header</section>
      <section data-route-section="charts-controls">
        <button onClick={() => scenario.set('scale')}>{scenario()}</button>
        <button onClick={() => animate.set((value) => !value)}>
          {animate() ? 'Animate' : 'Still'}
        </button>
      </section>
      <section data-chart-contract="AreaChart">Area chart</section>
      <section data-chart-contract="BarChart">Bar chart</section>
      <section data-chart-contract="LineChart">Line chart</section>
    </>
  );
}

function ComponentsPage() {
  const count = state(0);
  const name = state('');

  return (
    <>
      <section data-route-section="components-header">Components header</section>
      <section data-route-section="components-counter">
        <button onClick={() => count.set((value) => value + 1)}>
          {String(count())}
        </button>
      </section>
      <section data-route-section="components-controls">Tabs</section>
      <section data-route-section="components-shared-state">
        <input onInput={(event) => name.set((event.target as HTMLInputElement).value)} />
        <span>{name() || 'Shared state'}</span>
      </section>
    </>
  );
}

function AppLayout({ children }: { children?: unknown }) {
  return (
    <>
      <header>Shared shell</header>
      <main>{children}</main>
      <footer>Footer</footer>
    </>
  );
}

describe('fragment route cleanup', () => {
  let result: ReturnType<typeof createTestContainer>;

  beforeEach(() => {
    result = createTestContainer();
    clearRoutes();
    vi.clearAllMocks();
    Object.defineProperty(window, 'scrollTo', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    result.cleanup();
    clearRoutes();
  });

  it('does not retain previous route fragment siblings across repeated navigations', async () => {
    registerRoutes(() => {
      group({ layout: AppLayout }, () => {
        route('/charts', ChartsPage);
        route('/components', ComponentsPage);
      });
    });

    window.history.replaceState({}, '', '/charts');
    await createSPA({ root: result.container, routes: getRoutes() });
    flushScheduler();

    for (let index = 0; index < 8; index += 1) {
      expect(result.container.querySelectorAll('[data-chart-contract]')).toHaveLength(3);

      navigate('/components');
      flushScheduler();

      expect(result.container.querySelectorAll('[data-chart-contract]')).toHaveLength(0);
      expect(
        result.container.querySelector('[data-route-section="components-controls"]')
      ).not.toBeNull();
      expect(
        result.container.querySelector('[data-route-section="components-shared-state"]')
      ).not.toBeNull();

      navigate('/charts');
      flushScheduler();
    }
  });
});
