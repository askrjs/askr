import { describe, expect, it } from 'vitest';
import { Computation, Signal, untrack } from '../../../src/core/reactive/graph';
import { Owner } from '../../../src/core/reactive/owner';
import {
  effectScheduler,
  flushSync,
} from '../../../src/core/reactive/scheduler';

function computed<T>(fn: () => T, owner: Owner | null = null) {
  return new Computation<T>(owner, fn, null);
}

function effect(fn: () => void, owner: Owner | null = null) {
  const c = new Computation(owner, fn, effectScheduler('effect'), null);
  c.update();
  return c;
}

describe('reactive graph', () => {
  it('should recompute derived values lazily and only when a source changed', () => {
    const a = new Signal(1);
    let runs = 0;
    const double = computed(() => {
      runs++;
      return a.read() * 2;
    });
    expect(runs).toBe(0);
    expect(double.read()).toBe(2);
    expect(double.read()).toBe(2);
    expect(runs).toBe(1);
    a.write(2);
    expect(runs).toBe(1);
    expect(double.read()).toBe(4);
    expect(runs).toBe(2);
  });

  it('should cut off propagation when a derived value does not change', () => {
    const a = new Signal(1);
    const parity = computed(() => a.read() % 2);
    const seen: number[] = [];
    effect(() => {
      seen.push(parity.read());
    });
    a.write(3);
    flushSync();
    expect(seen).toEqual([1]);
    a.write(4);
    flushSync();
    expect(seen).toEqual([1, 0]);
  });

  it('should be glitch-free across diamond dependencies', () => {
    const a = new Signal(1);
    const b = computed(() => a.read() + 1);
    const c = computed(() => a.read() * 10);
    const seen: string[] = [];
    effect(() => {
      seen.push(`${b.read()}:${c.read()}`);
    });
    a.write(2);
    flushSync();
    expect(seen).toEqual(['2:10', '3:20']);
  });

  it('should track dynamic dependencies', () => {
    const flag = new Signal(true);
    const x = new Signal('x');
    const y = new Signal('y');
    const seen: string[] = [];
    effect(() => {
      seen.push(flag.read() ? x.read() : y.read());
    });
    y.write('y2');
    flushSync();
    expect(seen).toEqual(['x']);
    flag.write(false);
    flushSync();
    x.write('x2');
    flushSync();
    expect(seen).toEqual(['x', 'y2']);
  });

  it('should not track reads inside untrack', () => {
    const a = new Signal(1);
    let runs = 0;
    effect(() => {
      runs++;
      untrack(() => a.read());
    });
    a.write(2);
    flushSync();
    expect(runs).toBe(1);
  });

  it('should stop observing sources when disposed', () => {
    const a = new Signal(1);
    const owner = new Owner(null);
    let runs = 0;
    effect(() => {
      runs++;
      a.read();
    }, owner);
    owner.dispose();
    a.write(2);
    flushSync();
    expect(runs).toBe(1);
    expect(a._observers?.size ?? 0).toBe(0);
  });

  it('should rethrow a derived failure on read and recover when sources change', () => {
    const a = new Signal(0);
    const inverse = computed(() => {
      if (a.read() === 0) throw new Error('zero');
      return 1 / a.read();
    });
    expect(() => inverse.read()).toThrow('zero');
    a.write(2);
    expect(inverse.read()).toBe(0.5);
  });
});

describe('owner tree', () => {
  it('should dispose children before running its own cleanups, in reverse order', () => {
    const order: string[] = [];
    const root = new Owner(null);
    root.onCleanup(() => order.push('root'));
    const a = new Owner(root);
    a.onCleanup(() => order.push('a'));
    const b = new Owner(root);
    b.onCleanup(() => order.push('b1'));
    b.onCleanup(() => order.push('b2'));
    new Owner(a).onCleanup(() => order.push('a.child'));
    root.dispose();
    expect(order).toEqual(['b2', 'b1', 'a.child', 'a', 'root']);
  });

  it('should finish disposal when cleanups throw and return every failure', () => {
    const root = new Owner(null);
    const ran: string[] = [];
    root.onCleanup(() => ran.push('last'));
    new Owner(root).onCleanup(() => {
      throw new Error('one');
    });
    new Owner(root).onCleanup(() => {
      throw new Error('two');
    });
    const errors = root.dispose();
    expect(errors.map((e) => (e as Error).message)).toEqual(['two', 'one']);
    expect(ran).toEqual(['last']);
    expect(root.dispose()).toEqual([]);
  });

  it('should dispose a deeply nested lifetime without overflowing the stack', () => {
    const root = new Owner(null);
    root.context = new Map([['theme', 'dark']]);
    let leaf = root;
    for (let i = 0; i < 20_000; i++) leaf = new Owner(leaf);
    let cleaned = false;
    leaf.onCleanup(() => {
      cleaned = true;
    });

    expect(leaf.lookup('theme')).toBe('dark');
    expect(root.dispose()).toEqual([]);
    expect(cleaned).toBe(true);
    expect(leaf.disposed).toBe(true);
  });

  it('should resolve context through ancestors', () => {
    const root = new Owner(null);
    root.context = new Map([['theme', 'dark']]);
    const child = new Owner(new Owner(root));
    expect(child.lookup('theme')).toBe('dark');
    expect(child.lookup('missing')).toBeUndefined();
  });
});
