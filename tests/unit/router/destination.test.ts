import { schema } from '@askrjs/schema';
import { describe, expect, it } from 'vite-plus/test';
import { createRouteRegistry, route, to } from '../../../src/router';
import type { RouteRef } from '../../../src/common/router';

describe('typed route destinations', () => {
  it('should construct an encoded destination given typed params and search', () => {
    const ref = route('/users/{id}', () => null, {
      search: schema.object({
        tab: schema.enum(['profile', 'security'] as const),
        page: schema.optional(schema.integer()),
      }),
    });

    expect(to(ref, { id: 'a/b' }, { tab: 'profile', page: 2 })).toEqual({
      href: '/users/a%2Fb?tab=profile&page=2',
    });
  });

  it('should preserve slashes given a named splat route param', () => {
    const ref = route('/files/{*path}', () => null);

    expect(to(ref, { path: 'guides/a b' })).toEqual({
      href: '/files/guides/a%20b',
    });
  });

  it('should encode route search parameters losslessly given reserved and Unicode values when navigating', () => {
    const ref = route('/search', () => null);

    expect(to(ref, {}, { q: 'a&b=✓', tags: ['x/y', 'ümlaut'] })).toEqual({
      href: '/search?q=a%26b%3D%E2%9C%93&tags=x%2Fy&tags=%C3%BCmlaut',
    });
  });

  it('should reject a destination given missing params', () => {
    const ref = route('/users/{id}', () => null);

    expect(() => to(ref, {} as { id: string })).toThrow(
      'Missing route parameter "id".'
    );
  });

  it('should reject a destination given schema-invalid search', () => {
    const ref = route('/users', () => null, {
      search: schema.object({ tab: schema.enum(['profile'] as const) }),
    });

    expect(() => to(ref, {}, { tab: 'security' } as never)).toThrow(
      'Invalid route search. tab: Invalid enum value.'
    );
  });

  it('should construct physical destinations from a mounted registry', () => {
    let ref!: RouteRef<{ slug: string }>;
    createRouteRegistry(
      () => {
        ref = route('/reviews/{slug}', () => null);
      },
      { basePath: '/website/' }
    );

    expect(to(ref, { slug: 'the zoo box' })).toEqual({
      href: '/website/reviews/the%20zoo%20box',
    });
  });
});
