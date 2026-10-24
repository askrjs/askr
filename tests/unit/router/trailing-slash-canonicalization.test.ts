import { describe, expect, it } from 'vite-plus/test';
import { createRouteRegistry, matchRoute, route } from '@askrjs/askr/router';

/**
 * The trailing-slash policy rewrites paths that match a route; it never
 * rescues a run of slashes, which is a miss. Trimming is a linear scan, so a
 * path made of thousands of slashes, which any client can send, is answered
 * without a quadratic regular expression.
 */
describe('trailing slash canonicalization', () => {
  it('should treat one trailing slash by policy and a run of slashes as a miss', () => {
    const registry = createRouteRegistry(
      () => {
        route('/', () => 'home');
        route('/docs', () => 'docs');
      },
      { trailingSlash: 'never' }
    );
    expect(matchRoute('/docs/', { registry })?.path).toBe('/docs');
    expect(matchRoute(`/docs${'/'.repeat(5000)}`, { registry })).toBeNull();
    expect(matchRoute('/'.repeat(5000), { registry })).toBeNull();
  });

  it('should keep file-like paths without a trailing slash under the always policy', () => {
    const registry = createRouteRegistry(
      () => {
        route('/docs', () => 'docs');
        route('/files/{name}', () => 'file');
      },
      { trailingSlash: 'always' }
    );
    expect(matchRoute('/docs/', { registry })?.path).toBe('/docs');
    expect(matchRoute('/files/report.pdf', { registry })?.params).toEqual({
      name: 'report.pdf',
    });
  });
});
