import { describe, expect, it } from 'vite-plus/test';
import { queryScope, type QueryKeyPart } from '../../../src/data';

describe('scoped query array keys', () => {
  it('should distinguish empty arrays from sparse arrays by their positions', () => {
    const scope = queryScope('arrays');
    const oneHole = new Array<QueryKeyPart>(1);
    const twoHoles = new Array<QueryKeyPart>(2);

    expect(scope.key(oneHole)).not.toBe(scope.key([]));
    expect(scope.key(twoHoles)).not.toBe(scope.key(oneHole));
    expect(scope.key(oneHole)).toBe(scope.key([undefined]));
    expect(scope.key(twoHoles)).toBe(scope.key([undefined, undefined]));
  });

  it('should preserve sparse positions among dense entries', () => {
    const scope = queryScope('arrays');
    const sparse = new Array<QueryKeyPart>(3);
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
});
