import { describe, expect, it } from 'vite-plus/test';
import { Owner } from '../../../src/core/reactive/owner';

/** A context map that counts how often the lookup probes it. */
class CountingMap extends Map<unknown, unknown> {
  static probes = 0;
  override has(key: unknown): boolean {
    CountingMap.probes++;
    return super.has(key);
  }
}

function chain(depth: number): Owner[] {
  const owners: Owner[] = [new Owner(null)];
  for (let index = 1; index < depth; index++) {
    owners.push(new Owner(owners[index - 1]!));
  }
  for (const owner of owners) owner.context = new CountingMap();
  return owners;
}

const NOT_FOUND = Symbol('not-found');
const KEY = Symbol('scope');

describe('scope lookup cache', () => {
  it('should not walk a deep owner chain again after the first read', () => {
    const owners = chain(2_000);
    owners[0]!.setContext(KEY, 'root');
    const leaf = owners[owners.length - 1]!;

    CountingMap.probes = 0;
    expect(leaf.lookupScope(KEY, NOT_FOUND)).toBe('root');
    const firstWalk = CountingMap.probes;
    expect(firstWalk).toBeGreaterThan(1_000);

    CountingMap.probes = 0;
    expect(leaf.lookupScope(KEY, NOT_FOUND)).toBe('root');
    expect(CountingMap.probes).toBeLessThan(40);

    // Reading from every other level reuses the compressed path.
    CountingMap.probes = 0;
    for (const owner of owners) {
      expect(owner.lookupScope(KEY, NOT_FOUND)).toBe('root');
    }
    expect(CountingMap.probes).toBeLessThan(owners.length * 20);
  });

  it('should return the not-found marker for a missing key and cache it', () => {
    const owners = chain(500);
    const leaf = owners[owners.length - 1]!;
    expect(leaf.lookupScope(KEY, NOT_FOUND)).toBe(NOT_FOUND);
    CountingMap.probes = 0;
    expect(leaf.lookupScope(KEY, NOT_FOUND)).toBe(NOT_FOUND);
    expect(CountingMap.probes).toBeLessThan(40);
  });

  it('should see a provider change, a nearer provider and a removal', () => {
    const owners = chain(300);
    const leaf = owners[owners.length - 1]!;
    owners[0]!.setContext(KEY, 'a');
    expect(leaf.lookupScope(KEY, NOT_FOUND)).toBe('a');
    owners[0]!.setContext(KEY, 'b');
    expect(leaf.lookupScope(KEY, NOT_FOUND)).toBe('b');
    owners[150]!.setContext(KEY, 'near');
    expect(leaf.lookupScope(KEY, NOT_FOUND)).toBe('near');
    expect(owners[149]!.lookupScope(KEY, NOT_FOUND)).toBe('b');
    owners[150]!.deleteContext(KEY);
    expect(leaf.lookupScope(KEY, NOT_FOUND)).toBe('b');
  });

  it('should stop seeing ancestors once a subtree is detached', () => {
    const owners = chain(100);
    owners[0]!.setContext(KEY, 'root');
    const leaf = owners[99]!;
    expect(leaf.lookupScope(KEY, NOT_FOUND)).toBe('root');
    owners[50]!.detach();
    expect(leaf.lookupScope(KEY, NOT_FOUND)).toBe(NOT_FOUND);
  });
});
