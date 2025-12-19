import { describe, it, expect } from 'vitest';
import { getDeriveCache } from '../../src/shared/derive_cache';

describe('derive cache (UTILS)', () => {
  it('should return the same cache given the same instance when called twice', () => {
    const instance = { id: 'instance-a' };
    const c1 = getDeriveCache(instance);
    const c2 = getDeriveCache(instance);
    expect(c1).toBe(c2);
  });

  it('should return different caches given different instances when keys are set on one', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const ca = getDeriveCache(a);
    ca.set('key', 42);
    const cb = getDeriveCache(b);
    expect(cb.has('key')).toBe(false);
  });

  it('should store and retrieve values correctly given a cache when a value is set', () => {
    const instance = { id: 'x' };
    const cache = getDeriveCache(instance);
    cache.set('k', 'v');
    expect(getDeriveCache(instance).get('k')).toBe('v');
  });
});
