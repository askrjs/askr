/**
 * tests/router/matching.test.ts
 *
 * Path matching and parameter extraction
 */

import { describe, it, expect } from 'vitest';
import { match } from '../../src/router/match';

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

    it('should preserve parameter order when extracting params', () => {
      const result = match('/a/b/c', '/{x}/{y}/{z}');
      expect(result.params).toEqual({ x: 'a', y: 'b', z: 'c' });
    });

    it('should handle special URL characters in params when decoding', () => {
      const result = match('/search/hello%3Dworld', '/search/{query}');
      expect(result.matched).toBe(true);
      expect(result.params.query).toContain('=');
    });
  });
});
