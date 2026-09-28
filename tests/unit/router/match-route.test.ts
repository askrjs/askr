import { describe, expect, it } from 'vite-plus/test';
import { createRouteRegistry, matchRoute, route } from '@askrjs/askr/router';

describe('matchRoute', () => {
  it('should match decoded static segments and preserve encoded separators in captures', () => {
    const registry = createRouteRegistry(() => {
      route('/café/files/{*path}', () => 'files');
    });

    expect(matchRoute('/caf%C3%A9/files/a%2fb/c%20d', { registry })).toEqual({
      path: '/café/files/{*path}',
      params: { path: 'a%2Fb/c d' },
      namespace: undefined,
    });
  });

  it('should return null for paths outside the registry base path', () => {
    const registry = createRouteRegistry(
      () => {
        route('/users/{id}', () => 'user');
      },
      { basePath: '/app' }
    );

    expect(matchRoute('/users/1', { registry })).toBeNull();
    expect(matchRoute('/app/users/1', { registry })?.params).toEqual({
      id: '1',
    });
  });
});
