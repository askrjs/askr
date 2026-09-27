import { describe, expect, it } from 'vite-plus/test';
import { Owner } from '../../../src/core/reactive/owner';
import { disposeFailedSubtree } from '../../../src/ssr/render-sync';

describe('disposeFailedSubtree', () => {
  it('should dispose owned children newest first, skipping holes and the render computation', () => {
    const log: string[] = [];
    const instance = new Owner(null);
    const computation = new Owner(instance);
    const children = ['a', 'b', 'c', 'd'].map((name) => {
      const child = new Owner(instance);
      child.onCleanup(() => log.push(name));
      return child;
    });
    // Leave a hole where `b` was.
    children[1]!.dispose();
    log.length = 0;

    disposeFailedSubtree(
      Object.assign(instance, { computation }) as unknown as Parameters<
        typeof disposeFailedSubtree
      >[0]
    );

    expect(log).toEqual(['d', 'c', 'a']);
    expect(computation.disposed).toBe(false);
  });
});
