/**
 * tests/router/matching.test.ts
 *
 * Path matching and parameter extraction
 */

import { describe, it, expect } from 'vite-plus/test';
import { match } from '../../../src/router/match';

describe('route matching (ROUTER)', () => {
  describe('exact path matching', () => {
    it('should match exact static paths', () => {
      const result = match('/users', '/users');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({});
    });

    it('should fail on path mismatch', () => {
      const result = match('/users', '/posts');
      expect(result.matched).toBe(false);
      expect(result.params).toEqual({});
    });

    it('should handle root path', () => {
      const result = match('/', '/');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({});
    });

    it('should normalize trailing slashes', () => {
      const result = match('/users/', '/users');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({});
    });
  });

  describe('dynamic parameters', () => {
    it('should extract single parameter', () => {
      const result = match('/users/123', '/users/{id}');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ id: '123' });
    });

    it('should extract multiple parameters', () => {
      const result = match(
        '/users/123/posts/456',
        '/users/{userId}/posts/{postId}'
      );
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ userId: '123', postId: '456' });
    });

    it('should decode URL-encoded parameters', () => {
      const result = match('/posts/hello%20world', '/posts/{slug}');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ slug: 'hello world' });
    });

    it('should handle slugs with hyphens', () => {
      const result = match('/posts/my-awesome-post', '/posts/{slug}');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ slug: 'my-awesome-post' });
    });

    it('should fail when segment count mismatch', () => {
      const result = match('/users/123/extra', '/users/{id}');
      expect(result.matched).toBe(false);
      expect(result.params).toEqual({});
    });
  });

  describe('wildcard matching', () => {
    it('should match root catch-all as slash', () => {
      const result = match('/', '/*');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ '*': '/' });
    });

    it('should match single-segment wildcard', () => {
      const result = match('/any', '/*');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ '*': 'any' });
    });

    it('should match catch-all pattern', () => {
      const result = match('/admin/users/edit/123', '/*');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ '*': '/admin/users/edit/123' });
    });

    it('should match wildcard in segment', () => {
      const result = match('/posts/anything', '/posts/*');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ '*': 'anything' });
    });

    it('should fail wildcard when segment count mismatches', () => {
      const result = match('/posts', '/posts/{id}/*');
      expect(result.matched).toBe(false);
    });

    it('should match named splat routes across deep paths', () => {
      const result = match('/files/a/b/c', '/files/{*path}');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ path: 'a/b/c' });
    });

    it('should trim named splat parameter names', () => {
      const result = match('/files/a/b/c', '/files/{* path }');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ path: 'a/b/c' });
    });

    it('should match named splat routes with an empty trailing path', () => {
      const result = match('/files', '/files/{*path}');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ path: '' });
    });

    it('should normalize leading empty segments in named splat captures', () => {
      const result = match('/files//a/b', '/files/{*path}');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ path: 'a/b' });
    });

    it('should decode named splat params segment by segment', () => {
      const result = match('/files/a%20b/%E0%A4%A/c%2Fd', '/files/{*path}');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ path: 'a b/%E0%A4%A/c%2Fd' });
    });
  });

  describe('complex patterns', () => {
    it('should match nested routes with parameters when path matches', () => {
      const result = match(
        '/admin/users/123/settings',
        '/admin/{section}/{id}/settings'
      );
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ section: 'users', id: '123' });
    });

    it('should handle mixed params and literals when matching', () => {
      const result = match(
        '/api/v1/users/123/posts',
        '/api/v1/{resource}/{id}/posts'
      );
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ resource: 'users', id: '123' });
    });

    it('should fail on partial literal mismatch when path does not match exactly', () => {
      const result = match('/api/v2/users/123', '/api/v1/users/{id}');
      expect(result.matched).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty segments correctly when matching', () => {
      const result = match('/users/123', '/users/123');
      expect(result.matched).toBe(true);
    });

    it('should not collapse duplicate slashes in request paths', () => {
      const result = match('/docs//tabs', '/docs/tabs');
      expect(result.matched).toBe(false);
      expect(result.params).toEqual({});
    });

    it('should preserve parameter order when extracting params', () => {
      const result = match('/a/b/c', '/{x}/{y}/{z}');
      expect(result.params).toEqual({ x: 'a', y: 'b', z: 'c' });
    });

    it('should handle special URL characters in params when decoding', () => {
      const result = match('/search/hello%3Dworld', '/search/{query}');
      expect(result.matched).toBe(true);
      expect(result.params.query).toContain('=');
    });

    it('should preserve malformed percent-encoded params instead of throwing', () => {
      expect(() => match('/posts/%E0%A4%A', '/posts/{slug}')).not.toThrow();

      const result = match('/posts/%E0%A4%A', '/posts/{slug}');
      expect(result.matched).toBe(true);
      expect(result.params).toEqual({ slug: '%E0%A4%A' });
    });
  });
  describe('percent-encoded static segments', () => {
    it('should match non-ASCII static segments against encoded URLs', () => {
      expect(match('/caf%C3%A9', '/café').matched).toBe(true);
      expect(match('/menu/caf%C3%A9/cr%C3%AApe', '/menu/café/{item}')).toEqual({
        matched: true,
        params: { item: 'crêpe' },
      });
    });

    it('should match static segments containing spaces', () => {
      expect(match('/a%20b', '/a b').matched).toBe(true);
    });

    it('should match static segments with encoded reserved characters', () => {
      expect(match('/a%3Ab', '/a:b').matched).toBe(true);
      expect(match('/%40user', '/@user').matched).toBe(true);
      expect(match('/a%2Bb', '/a+b').matched).toBe(true);
      expect(match('/100%25', '/100%').matched).toBe(true);
    });

    it('should normalize percent-encoded route segments too', () => {
      expect(match('/café', '/caf%C3%A9').matched).toBe(true);
      expect(match('/caf%c3%a9', '/caf%C3%A9').matched).toBe(true);
      expect(match('/a%2Fb', '/a%2Fb').matched).toBe(true);
    });

    it('should match non-canonical encodings of static segments', () => {
      expect(match('/%61dmin', '/admin').matched).toBe(true);
    });

    it('should not treat an encoded slash as a segment separator', () => {
      expect(match('/a%2Fb', '/a/b').matched).toBe(false);
    });

    it('should not match or throw on malformed encodings', () => {
      expect(() => match('/caf%C3', '/café')).not.toThrow();
      expect(match('/caf%C3', '/café').matched).toBe(false);
      expect(match('/caf%C3', '/caf%C3').matched).toBe(true);
    });
  });
  describe('percent-encoded wildcard captures', () => {
    it('should decode single-segment wildcard captures', () => {
      expect(match('/files/caf%C3%A9', '/files/*').params).toEqual({
        '*': 'café',
      });
      expect(match('/files/a%20b', '/files/*').params).toEqual({ '*': 'a b' });
    });

    it('should decode root catch-all captures segment by segment', () => {
      expect(match('/caf%C3%A9/a%20b', '/*').params).toEqual({
        '*': '/café/a b',
      });
      expect(match('/caf%C3%A9', '/*').params).toEqual({ '*': 'café' });
    });

    it('should keep malformed wildcard captures as written', () => {
      expect(() => match('/files/%E0%A4%A', '/files/*')).not.toThrow();
      expect(match('/files/%E0%A4%A', '/files/*').params).toEqual({
        '*': '%E0%A4%A',
      });
    });
  });
  describe('encoded separators in captures', () => {
    const traversal = '..%2F..%2Fetc%2Fpasswd';

    it('should keep %2F encoded in wildcard captures', () => {
      expect(match(`/files/${traversal}`, '/files/*').params).toEqual({
        '*': traversal,
      });
    });

    it('should keep %2F encoded in named splat captures', () => {
      expect(match(`/files/${traversal}`, '/files/{*path}').params).toEqual({
        path: traversal,
      });
    });

    it('should keep %2F encoded in param captures', () => {
      expect(match(`/posts/${traversal}`, '/posts/{slug}').params).toEqual({
        slug: traversal,
      });
    });

    it('should keep %2F encoded in catch-all captures', () => {
      expect(match('/a%2Fb/c', '/*').params).toEqual({ '*': '/a%2Fb/c' });
      expect(match(`/${traversal}`, '/*').params).toEqual({ '*': traversal });
    });

    it('should keep %5C encoded and normalize separator case', () => {
      expect(match('/files/..%5c..%5cwin.ini', '/files/*').params).toEqual({
        '*': '..%5C..%5Cwin.ini',
      });
      expect(match('/files/a%2fb', '/files/{*path}').params).toEqual({
        path: 'a%2Fb',
      });
    });

    it('should still decode other characters around a kept separator', () => {
      expect(match('/files/caf%C3%A9%2Fa%20b', '/files/*').params).toEqual({
        '*': 'café%2Fa b',
      });
    });
  });
});
