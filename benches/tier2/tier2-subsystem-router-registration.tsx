import { bench, describe, expect } from 'vite-plus/test';
import { createRouteRegistry, route } from '../../src/router/route';
import { clearRouteState } from '../../src/router/store';
import { tier2BenchOptions } from '../shared/_shared';

const routeEntries = Array.from({ length: 250 }, (_, index) => ({
  path: `/bench/${index}/{id}`,
  handler: () => <div>{`Route ${index}`}</div>,
}));

const registry = createRouteRegistry(() => {
  for (const entry of routeEntries) route(entry.path, entry.handler);
});
expect(registry.routes).toHaveLength(routeEntries.length);

describe('tier2 router registration', () => {
  bench(
    'clear and register a 250-route table',
    () => {
      clearRouteState();
      for (const entry of routeEntries) {
        route(entry.path, entry.handler);
      }
    },
    {
      ...tier2BenchOptions,
      setup() {
        clearRouteState();
      },
      teardown() {
        clearRouteState();
      },
    }
  );
});
