import { describe, expect, it } from 'vite-plus/test';
import { createRouteRegistry, matchRoute, route } from '@askrjs/askr/router';

/**
 * An empty path segment (`/users//x`) is not a value for a parameter, and a
 * path with extra trailing slashes is not the same as the path without them.
 */
describe('matchRoute with empty segments', () => {
  const registry = createRouteRegistry(() => {
    route('/users', () => 'users');
    route('/users/{id}', () => 'user');
    route('/users/{id}/x', () => 'user-x');
    route('/files/{*path}', () => 'files');
  });

  it('should not capture an empty interior segment as a parameter', () => {
    expect(matchRoute('/users//x', { registry })).toBeNull();
    expect(matchRoute('/users/1/x', { registry })?.params).toEqual({
      id: '1',
    });
  });

  it('should not match a parameter route with only trailing slashes', () => {
    expect(matchRoute('/users///', { registry })).toBeNull();
    expect(matchRoute('/users//', { registry })).toBeNull();
    expect(matchRoute('/users/', { registry })?.path).toBe('/users');
  });

  it('should still let a splat capture an empty remainder', () => {
    expect(matchRoute('/files/', { registry })?.params).toEqual({ path: '' });
    expect(matchRoute('/files/a/b', { registry })?.params).toEqual({
      path: 'a/b',
    });
  });
});
