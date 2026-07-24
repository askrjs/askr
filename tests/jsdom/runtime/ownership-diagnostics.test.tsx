import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import { createDataRuntime, createQuery } from '../../../src/data';
import { Portal } from '../../../src/runtime/portal';
import { resource } from '../../../src/runtime/resource-operation';
import { timer } from '../../../src/runtime/lifecycle-operations';
import { getOwnershipDiagnostics } from '../../../src/runtime/ownership-diagnostics';
import { navigate } from '../../../src/router/navigate';
import { route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('ownership diagnostics', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
  });

  afterEach(() => {
    cleanupApp(container);
    cleanup();
    resetRouteState();
  });

  it('should return route-owned resources to their development plateaus', async () => {
    const baseline = getOwnershipDiagnostics();
    const dataRuntime = createDataRuntime();

    function InstrumentedRoute() {
      const query = createQuery({
        runtime: dataRuntime,
        key: 'ownership-diagnostics',
        initialData: { label: 'query' },
        fetch: async () => ({ label: 'query' }),
      });
      const currentResource = resource(() => 'resource', []);
      timer(60_000, () => {});
      Portal({
        children: <aside data-diagnostic-portal={'true'}>{'portal'}</aside>,
      });

      return (
        <main>
          {`${query.data?.label ?? ''}:${currentResource.value ?? 'pending'}`}
        </main>
      );
    }

    route('/instrumented', InstrumentedRoute);
    route('/plain', () => <main>{'plain'}</main>);
    window.history.replaceState({}, '', '/instrumented');
    await createSPA({
      root: container,
      registry: currentRouteRegistry(),
      dataRuntime,
    });
    flushScheduler();
    flushScheduler();

    const activePlateau = getOwnershipDiagnostics();
    expect(activePlateau.routeGenerations).toBe(baseline.routeGenerations + 1);
    expect(activePlateau.queryOwners).toBe(baseline.queryOwners + 1);
    expect(activePlateau.queryCells).toBe(baseline.queryCells + 1);
    expect(activePlateau.timers).toBe(baseline.timers + 1);
    expect(activePlateau.resources).toBe(baseline.resources + 1);
    expect(activePlateau.portals).toBe(baseline.portals + 1);
    expect(activePlateau.readableReaders).toBeGreaterThan(
      baseline.readableReaders
    );
    expect(activePlateau.queuedSchedulerWork).toBe(0);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      navigate('/plain');
      flushScheduler();

      const plainPlateau = getOwnershipDiagnostics();
      expect(plainPlateau.routeGenerations).toBe(baseline.routeGenerations + 1);
      expect(plainPlateau.queryOwners).toBe(baseline.queryOwners);
      expect(plainPlateau.queryCells).toBe(baseline.queryCells);
      expect(plainPlateau.timers).toBe(baseline.timers);
      expect(plainPlateau.resources).toBe(baseline.resources);
      expect(plainPlateau.portals).toBe(baseline.portals);
      expect(plainPlateau.queuedSchedulerWork).toBe(0);

      navigate('/instrumented');
      flushScheduler();
      flushScheduler();

      expect(getOwnershipDiagnostics()).toEqual(activePlateau);
    }

    cleanupApp(container);
    flushScheduler();
    expect(getOwnershipDiagnostics()).toEqual(baseline);
  });
});
