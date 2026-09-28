import { describe, expect, it } from 'vite-plus/test';
import { Owner } from '../../../src/core/reactive/owner';

function childrenOf(owner: Owner): Owner[] {
  return (owner.owned ?? []).filter((child): child is Owner => child !== null);
}

function tracked(parent: Owner, name: string, log: string[]): Owner {
  const owner = new Owner(parent);
  owner.onCleanup(() => log.push(name));
  return owner;
}

describe('owner detach', () => {
  it('should dispose remaining children in reverse creation order after middle detaches', () => {
    const log: string[] = [];
    const parent = new Owner(null);
    const children = Array.from({ length: 6 }, (_, index) =>
      tracked(parent, `c${index}`, log)
    );

    children[1]!.dispose();
    children[3]!.dispose();
    expect(log).toEqual(['c1', 'c3']);

    parent.dispose();
    expect(log).toEqual(['c1', 'c3', 'c5', 'c4', 'c2', 'c0']);
  });

  it('should keep creation order through hole compaction', () => {
    const log: string[] = [];
    const parent = new Owner(null);
    const children = Array.from({ length: 100 }, (_, index) =>
      tracked(parent, `c${index}`, log)
    );

    // Detach every child but the last ten, front to back, forcing compaction.
    for (const child of children.slice(0, 90)) child.dispose();
    expect(childrenOf(parent)).toEqual(children.slice(90));
    expect(parent.owned!.length).toBeLessThan(100);

    // Children added after compaction keep their place after the survivors.
    const late = tracked(parent, 'late', log);
    children[95]!.dispose();
    log.length = 0;
    parent.dispose();
    expect(log).toEqual([
      'late',
      'c99',
      'c98',
      'c97',
      'c96',
      'c94',
      'c93',
      'c92',
      'c91',
      'c90',
    ]);
    expect(late.disposed).toBe(true);
  });

  it('should drop trailing holes when the last child detaches', () => {
    const parent = new Owner(null);
    const [a, b, c] = [new Owner(parent), new Owner(parent), new Owner(parent)];

    b.dispose();
    c.dispose();
    expect(parent.owned).toEqual([a]);
  });

  it('should let a detached child be disposed and a reset parent own new children', () => {
    const parent = new Owner(null);
    const first = new Owner(parent);
    first.detach();
    expect(childrenOf(parent)).toEqual([]);
    expect(first.parent).toBeNull();

    parent.reset();
    const next = new Owner(parent);
    expect(childrenOf(parent)).toEqual([next]);
    next.dispose();
    expect(childrenOf(parent)).toEqual([]);
  });

  it('should not let a stale sibling clear a child created during disposal', () => {
    const parent = new Owner(null);
    const first = new Owner(parent);
    const second = new Owner(parent);
    let created: Owner | null = null;
    second.onCleanup(() => {
      // Runs while reset() disposes children newest first: `first` still
      // points at its old index, which the new child now occupies.
      created = new Owner(parent);
      first.dispose();
    });

    parent.reset();
    expect(created).not.toBeNull();
    expect(parent.owned).toEqual([created]);
    expect(first.disposed).toBe(true);
  });
});
