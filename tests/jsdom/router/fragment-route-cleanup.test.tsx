import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { state } from '../../../src';
import { createSPA } from '@askrjs/askr/boot';
import { For } from '../../../src/control';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, group, route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function isJsxElement(value: unknown): value is { key?: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    'props' in value
  );
}

function toChildArray(children: unknown): unknown[] {
  if (Array.isArray(children)) {
    return children;
  }

  return children === undefined || children === null ? [] : [children];
}

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
      <section data-route-section="components-header">
        Components header
      </section>
      <section data-route-section="components-counter">
        <button onClick={() => count.set((value) => value + 1)}>
          {String(count())}
        </button>
      </section>
      <section data-route-section="components-controls">Tabs</section>
      <section data-route-section="components-shared-state">
        <input
          onInput={(event) =>
            name.set((event.target as HTMLInputElement).value)
          }
        />
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

function RouteList({ items }: { items: unknown[] }) {
  return (
    <div data-slot="grid">
      <For each={items} byIndex={true}>
        {(item) => item as never}
      </For>
    </div>
  );
}

function GridLike({ children }: { children?: unknown }) {
  return (
    <div data-slot="grid">
      <For
        each={() => toChildArray(children)}
        by={(child, index) =>
          isJsxElement(child) && child.key != null ? child.key : index
        }
      >
        {(child) => child as never}
      </For>
    </div>
  );
}

describe('fragment route cleanup', () => {
  let result: ReturnType<typeof createTestContainer>;

  beforeEach(() => {
    result = createTestContainer();
    resetRouteState();
    vi.clearAllMocks();
    Object.defineProperty(window, 'scrollTo', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    result.cleanup();
    resetRouteState();
  });

  it('should not retain previous route fragment siblings across repeated navigations', async () => {
    const registry = createRouteRegistry(() => {
      group({ layout: AppLayout }, () => {
        route('/charts', ChartsPage);
        route('/components', ComponentsPage);
      });
    });

    window.history.replaceState({}, '', '/charts');
    await createSPA({
      root: result.container,
      registry,
    });
    flushScheduler();

    for (let index = 0; index < 8; index += 1) {
      expect(
        result.container.querySelectorAll('[data-chart-contract]')
      ).toHaveLength(3);

      navigate('/components');
      flushScheduler();

      expect(
        result.container.querySelectorAll('[data-chart-contract]')
      ).toHaveLength(0);
      expect(
        result.container.querySelector(
          '[data-route-section="components-controls"]'
        )
      ).not.toBeNull();
      expect(
        result.container.querySelector(
          '[data-route-section="components-shared-state"]'
        )
      ).not.toBeNull();

      navigate('/charts');
      flushScheduler();
    }
  });

  it('should replace For-rendered child lists when a route changes', async () => {
    function ChartsPageWithGrid() {
      return (
        <RouteList
          items={[
            <section data-chart-contract="AreaChart">Area chart</section>,
            <section data-chart-contract="BarChart">Bar chart</section>,
            <section data-chart-contract="LineChart">Line chart</section>,
            <section data-chart-contract="DonutChart">Donut chart</section>,
            <section data-chart-contract="StackedBarChart">
              Stacked bar chart
            </section>,
            <section data-chart-contract="Sparkline">Sparkline</section>,
            <section data-chart-contract="Heatmap">Heatmap</section>,
            <section data-chart-contract="Timeline">Timeline</section>,
            <section data-chart-contract="FlameGraph">Flame graph</section>,
            <section data-chart-contract="ProgressMeter">
              Progress meter
            </section>,
            <section data-chart-contract="RadialGauge">Radial gauge</section>,
          ]}
        />
      );
    }

    function ComponentsPageWithGrid() {
      return (
        <RouteList
          items={[
            <section data-route-section="components-controls">Tabs</section>,
            <section data-route-section="components-shared-state">
              Shared state
            </section>,
          ]}
        />
      );
    }

    const registry = createRouteRegistry(() => {
      group({ layout: AppLayout }, () => {
        route('/charts', ChartsPageWithGrid);
        route('/components', ComponentsPageWithGrid);
      });
    });

    window.history.replaceState({}, '', '/charts');
    await createSPA({
      root: result.container,
      registry,
    });
    flushScheduler();

    expect(
      result.container.querySelectorAll('[data-chart-contract]')
    ).toHaveLength(11);

    navigate('/components');
    flushScheduler();

    expect(
      result.container.querySelectorAll('[data-chart-contract]')
    ).toHaveLength(0);
    expect(
      result.container.querySelector(
        '[data-route-section="components-controls"]'
      )
    ).not.toBeNull();
    expect(
      result.container.querySelector(
        '[data-route-section="components-shared-state"]'
      )
    ).not.toBeNull();
  });

  it('should update Grid-like children closures when a route changes', async () => {
    function ChartsPageWithGridLike() {
      return (
        <GridLike>
          <section data-chart-contract="AreaChart">Area chart</section>
          <section data-chart-contract="BarChart">Bar chart</section>
          <section data-chart-contract="LineChart">Line chart</section>
          <section data-chart-contract="DonutChart">Donut chart</section>
          <section data-chart-contract="StackedBarChart">
            Stacked bar chart
          </section>
          <section data-chart-contract="Sparkline">Sparkline</section>
          <section data-chart-contract="Heatmap">Heatmap</section>
          <section data-chart-contract="Timeline">Timeline</section>
          <section data-chart-contract="FlameGraph">Flame graph</section>
          <section data-chart-contract="ProgressMeter">Progress meter</section>
          <section data-chart-contract="RadialGauge">Radial gauge</section>
        </GridLike>
      );
    }

    function ComponentsPageWithGridLike() {
      return (
        <GridLike>
          <section data-route-section="components-controls">Tabs</section>
          <section data-route-section="components-shared-state">
            Shared state
          </section>
        </GridLike>
      );
    }

    const registry = createRouteRegistry(() => {
      group({ layout: AppLayout }, () => {
        route('/charts', ChartsPageWithGridLike);
        route('/components', ComponentsPageWithGridLike);
      });
    });

    window.history.replaceState({}, '', '/charts');
    await createSPA({
      root: result.container,
      registry,
    });
    flushScheduler();

    expect(
      result.container.querySelectorAll('[data-chart-contract]')
    ).toHaveLength(11);

    navigate('/components');
    flushScheduler();

    expect(
      result.container.querySelectorAll('[data-chart-contract]')
    ).toHaveLength(0);
    expect(
      result.container.querySelector('div[data-slot="grid"]')
    ).not.toBeNull();
  });
});
