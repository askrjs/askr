import { describe, expect, it } from 'vitest';
import { Computation, Signal, untrack } from '../../../src/core/reactive/graph';
import { Owner } from '../../../src/core/reactive/owner';
import {
  clearScheduler,
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

  it('should retain invalidation when an effect writes a source it reads', () => {
    const count = new Signal(0);
    const seen: number[] = [];
    let writeDuringRun = false;
    const computation = effect(() => {
      const value = count.read();
      seen.push(value);
      if (writeDuringRun && value < 3) count.write(value + 1);
    });

    writeDuringRun = true;
    count.write(1);
    flushSync();

    expect(seen).toEqual([0, 1, 2, 3]);
    expect(count.peek()).toBe(3);
    computation.dispose();
  });

  it('should report a self-invalidating effect through the scheduler guard', () => {
    const count = new Signal(0);
    let writeDuringRun = false;
    const computation = effect(() => {
      const value = count.read();
      if (writeDuringRun) count.write(value + 1);
    });

    writeDuringRun = true;
    count.write(1);
    expect(() => flushSync()).toThrow(/exceeded MAX_FLUSH_DEPTH/);
    expect(count.peek()).toBe(51);

    writeDuringRun = false;
    count.write(100);
    flushSync();
    expect(count.peek()).toBe(100);
    computation.dispose();
  });

  it('should bound and report failures from a self-invalidating effect', () => {
    const count = new Signal(0);
    let failDuringRun = false;
    const computation = effect(() => {
      const value = count.read();
      if (!failDuringRun) return;
      count.write(value + 1);
      throw new Error('effect failed after invalidation');
    });

    failDuringRun = true;
    count.write(1);
    let failure: unknown;
    try {
      flushSync();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    const failures = (failure as AggregateError).errors;
    expect(
      failures.filter(
        (error) =>
          error instanceof Error &&
          error.message === 'effect failed after invalidation'
      )
    ).toHaveLength(50);
    expect(
      failures.some(
        (error) =>
          error instanceof Error &&
          /exceeded MAX_FLUSH_DEPTH/.test(error.message)
      )
    ).toBe(true);
    expect(count.peek()).toBe(51);

    failDuringRun = false;
    count.write(100);
    expect(() => flushSync()).not.toThrow();
    expect(count.peek()).toBe(100);
    computation.dispose();
  });

  it('should leave downstream effects observing the settled source value', () => {
    const count = new Signal(0);
    let writeDuringRun = false;
    const writer = effect(() => {
      const value = count.read();
      if (writeDuringRun && value < 3) count.write(value + 1);
    });
    const seen: number[] = [];
    const observer = effect(() => seen.push(count.read()));

    writeDuringRun = true;
    count.write(1);
    flushSync();

    expect(count.peek()).toBe(3);
    expect(seen.at(-1)).toBe(3);
    writer.dispose();
    observer.dispose();
  });

  it('should allow a later source write after clearing a self-requeued job', () => {
    const count = new Signal(0);
    let writeDuringRun = false;
    let clearDuringRun = false;
    const seen: number[] = [];
    const computation = effect(() => {
      const value = count.read();
      seen.push(value);
      if (writeDuringRun && value < 3) {
        count.write(value + 1);
        if (clearDuringRun) {
          clearDuringRun = false;
          clearScheduler();
        }
      }
    });

    writeDuringRun = true;
    clearDuringRun = true;
    count.write(1);
    flushSync();

    writeDuringRun = false;
    count.write(100);
    flushSync();

    expect(seen.at(-1)).toBe(100);
    computation.dispose();
  });

  it('should not restore subscriptions when disposed during a run', () => {
    const count = new Signal(0);
    let computation!: Computation<unknown>;
    let disposeDuringRun = false;
    computation = new Computation<unknown>(
      null,
      () => {
        const value = count.read();
        if (disposeDuringRun) {
          count.write(value + 1);
          computation.dispose();
        }
      },
      effectScheduler('effect'),
      null
    );
    computation.update();

    disposeDuringRun = true;
    count.write(1);
    flushSync();

    expect(computation.disposed).toBe(true);
    expect(count._observers?.has(computation)).toBe(false);
    computation.dispose();
  });

  it('should keep outer dependencies across a nested computation run', () => {
    const first = new Signal(1);
    const second = new Signal(10);
    const inner = new Signal(100);
    const nested = computed(() => inner.read());
    const seen: number[] = [];
    effect(() => {
      const value = first.read();
      nested.run();
      seen.push(value + second.read());
    });
    first.write(2);
    flushSync();
    second.write(20);
    flushSync();
    inner.write(200);
    flushSync();
    expect(seen).toEqual([11, 12, 22]);
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

  it('should wake readers when a deferred lazy computation receives a later source change', () => {
    const input = new Signal(1);
    const doubled = computed(() => input.read() * 2);
    const seen: number[] = [];
    const observer = effect(() => seen.push(doubled.read()));

    doubled.deferRetry();
    flushSync();
    expect(seen).toEqual([2]);

    input.write(2);
    flushSync();

    expect(seen).toEqual([2, 4]);
    observer.dispose();
    doubled.dispose();
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
