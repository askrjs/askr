import { expect, test } from 'vite-plus/test';
import { createDataRuntime, refreshOnActivity } from '../../../src/data';

test('should allow DOM-free activity setup outside a component without refreshing cached data', () => {
  const runtime = createDataRuntime();
  const data = { value: 'server snapshot' };
  runtime.queryData.set('server:1', data);
  expect(() =>
    refreshOnActivity('server:', { staleTimeMs: 'always', runtime })
  ).not.toThrow();
  expect(runtime.queryData.get('server:1')).toBe(data);
});
