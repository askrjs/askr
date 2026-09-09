/**
 * A registry is built against a route table of its own.
 *
 * Invariant guard, not a regression reproducer: the previous implementation
 * reached the same results by snapshotting the live route table, clearing it,
 * running the definition against the emptied globals and restoring afterwards,
 * so these cases pass with or without that change. They pin isolation as a
 * contract now that it is structural rather than a property of getting the
 * save/restore ordering right.
 */

import { describe, it, expect, beforeEach } from 'vite-plus/test';
import { createRouteRegistry, route } from '../../../src/router/route';
import { getRouteList } from '../../../src/router/store';
import { resetRouteState } from '../../router-test-utils';

describe('route registry isolation', () => {
  beforeEach(() => {
    resetRouteState();
  });

  it('should leave the application route table untouched', () => {
    route('/app-owned', () => <div>app</div>);
    expect(getRouteList().map((entry) => entry.path)).toEqual(['/app-owned']);

    const registry = createRouteRegistry(() => {
      route('/registry-owned', () => <div>registry</div>);
    });

    expect(registry.routes.map((entry) => entry.path)).toEqual([
      '/registry-owned',
    ]);
    expect(getRouteList().map((entry) => entry.path)).toEqual(['/app-owned']);
  });

  it('should keep the application routes visible while a definition runs', () => {
    route('/app-owned', () => <div>app</div>);

    let visibleDuringDefinition: string[] = [];
    createRouteRegistry(() => {
      route('/registry-owned', () => <div>registry</div>);
      visibleDuringDefinition = getRouteList().map((entry) => entry.path);
    });

    // The definition sees its own table, and the application's routes survive.
    expect(visibleDuringDefinition).toEqual(['/registry-owned']);
    expect(getRouteList().map((entry) => entry.path)).toEqual(['/app-owned']);
  });

  it('should build nested registries without leaking between them', () => {
    let inner: ReturnType<typeof createRouteRegistry> | undefined;

    const outer = createRouteRegistry(() => {
      route('/outer', () => <div>outer</div>);
      inner = createRouteRegistry(() => {
        route('/inner', () => <div>inner</div>);
      });
      route('/outer-after', () => <div>after</div>);
    });

    expect(inner?.routes.map((entry) => entry.path)).toEqual(['/inner']);
    expect(outer.routes.map((entry) => entry.path)).toEqual([
      '/outer',
      '/outer-after',
    ]);
  });
});
