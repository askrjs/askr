import { describe, expect, it } from 'vite-plus/test';
import { queryScope, type QueryKeyPart } from '../../../src/data';

describe('scoped query array keys', () => {
  it('should distinguish empty arrays from sparse arrays by their positions', () => {
    const scope = queryScope('arrays');
    const oneHole: QueryKeyPart[] = [];
    const twoHoles: QueryKeyPart[] = [];
    oneHole.length = 1;
    twoHoles.length = 2;

    expect(scope.key(oneHole)).not.toBe(scope.key([]));
    expect(scope.key(twoHoles)).not.toBe(scope.key(oneHole));
    expect(scope.key(oneHole)).toBe(scope.key([undefined]));
    expect(scope.key(twoHoles)).toBe(scope.key([undefined, undefined]));
  });

  it('should preserve sparse positions among dense entries', () => {
    const scope = queryScope('arrays');
    const sparse: QueryKeyPart[] = [];
    sparse.length = 3;
    sparse[1] = 'middle';

    expect(scope.key(sparse)).toBe(scope.key([undefined, 'middle', undefined]));
    expect(scope.key(sparse)).not.toBe(scope.key(['middle']));
  });

  it('should preserve existing dense array key bytes', () => {
    const scope = queryScope('arrays');

    expect(scope.key([])).toBe('s=arrays:a[]:');
    expect(scope.key(['a', 1, true, null, undefined])).toBe(
      's=arrays:a[s=a,n=1,b=1,null,undefined]:'
    );
  });

  it('should serialize array positions independently of a custom iterator', () => {
    const scope = queryScope('arrays');
    const parts: QueryKeyPart[] = ['alpha', 'beta'];
    parts[Symbol.iterator] = () => ['alpha'].values();

    expect(scope.key(parts)).toBe('s=arrays:a[s=alpha,s=beta]:');
    expect(scope.prefix(parts)).toBe(scope.key(['alpha', 'beta']));
  });

  it('should serialize lone surrogate strings and object keys without collisions', () => {
    const scope = queryScope('surrogates');
    const high = '\uD800';
    const low = '\uDC00';

    expect(() => scope.key(high)).not.toThrow();
    expect(() => scope.key({ [low]: 'value' })).not.toThrow();
    expect(scope.key(high)).not.toBe(scope.key('\uFFFD'));
    expect(scope.key(low)).not.toBe(scope.key('%uDC00'));
    expect(scope.key({ [low]: 'value' })).not.toBe(
      scope.key({ '%uDC00': 'value' })
    );
  });

  it('should serialize false and special numeric key parts distinctly', () => {
    const scope = queryScope('primitives');

    expect(scope.key(false)).toBe('s=primitives:b=0:');
    expect(scope.key(Number.NaN)).toBe('s=primitives:n=NaN:');
    expect(scope.key(-0)).toBe('s=primitives:n=-0:');
    expect(scope.key(Infinity)).toBe('s=primitives:n=Infinity:');
    expect(scope.key(-Infinity)).toBe('s=primitives:n=-Infinity:');
  });

  it('should encode well-formed surrogate pairs in strings', () => {
    const scope = queryScope('surrogates');

    expect(scope.key('\uD83D\uDE00')).toBe('s=surrogates:s=%F0%9F%98%80:');
  });
});
