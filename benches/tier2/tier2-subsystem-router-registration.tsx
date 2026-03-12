import { bench, describe, expect } from 'vitest';
import { clearRoutes, getRoutes, route } from '../../src/router/route';
import { tier2BenchOptions } from '../shared/_shared';

const routeEntries = Array.from({ length: 250 }, (_, index) => ({
  path: `/bench/${index}/{id}`,
  handler: () => <div>{`Route ${index}`}</div>,
}));

clearRoutes();
for (const entry of routeEntries) {
  route(entry.path, entry.handler);
}
expect(getRoutes()).toHaveLength(routeEntries.length);
clearRoutes();

describe('tier2 router registration', () => {
  bench(
    'register a 250-route table',
    () => {
      for (const entry of routeEntries) {
        route(entry.path, entry.handler);
      }
    },
    {
      ...tier2BenchOptions,
      setup() {
        clearRoutes();
      },
      teardown() {
        clearRoutes();
      },
    }
  );
});
