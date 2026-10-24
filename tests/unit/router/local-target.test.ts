import { describe, expect, it } from 'vite-plus/test';
import { localTarget } from '../../../src/router';

describe('localTarget', () => {
  it('should keep a same-origin root-relative target', () => {
    expect(localTarget('/dashboard?tab=2#top')).toBe('/dashboard?tab=2#top');
    expect(localTarget('/a/../b')).toBe('/b');
  });

  it('should resolve a relative target against the origin root', () => {
    expect(localTarget('dashboard')).toBe('/dashboard');
  });

  it('should use the fallback for missing and empty values', () => {
    expect(localTarget(null)).toBe('/');
    expect(localTarget('')).toBe('/');
    expect(localTarget(null, '/home')).toBe('/home');
  });

  it.each([
    'https://evil.example/x',
    'http://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/.//evil.example',
    '/%2e//evil.example',
    '/x/..//evil.example',
    'javascript:alert(1)',
    'data:text/html,hi',
  ])('should reject %s', (value) => {
    expect(localTarget(value, '/safe')).toBe('/safe');
  });
});
