import { describe, expect, it } from 'vitest';
import { cloneElement, isElement } from '../../../src/foundations/structures';
import { jsx } from '../../../src/jsx-runtime';

describe('public JSX cloning', () => {
  it('should clone public element fields without copying renderer-owned cache state', () => {
    const cacheKey = Symbol.for('__askrStaticChildSlots');
    const source = jsx('span', { children: 'source' });
    Object.defineProperty(source, cacheKey, {
      configurable: true,
      enumerable: true,
      value: ['stale renderer state'],
    });

    const cloned = cloneElement(source, { title: 'cloned' });

    expect(isElement(cloned)).toBe(true);
    expect(cloned).not.toBe(source);
    expect(cloned.props).toEqual({ children: 'source', title: 'cloned' });
    expect(
      (cloned as unknown as Record<symbol, unknown>)[cacheKey]
    ).toBeUndefined();
  });
});
