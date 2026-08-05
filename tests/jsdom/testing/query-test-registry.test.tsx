import { describe, expect, it } from 'vite-plus/test';
import { createQuery, queryScope } from '../../../src/data';
import { createQueryTestRegistry, queryState } from '../../../src/testing';

describe('query test registry', () => {
  it('should return a fixture by canonical query key', () => {
    const registry = createQueryTestRegistry();
    const queries = queryScope('orders');
    const key = queries.key('overview', 'all');
    registry.set(key, queryState.fresh({ count: 3 }));
    const query = createQuery(
      {
        key: (input: { filter: string }) =>
          queries.key('overview', input.filter),
        fetch: async () => ({ count: 0 }),
      },
      { filter: 'all' },
      { runtime: registry.runtime }
    );
    expect(query.data).toEqual({ count: 3 });
  });
});
