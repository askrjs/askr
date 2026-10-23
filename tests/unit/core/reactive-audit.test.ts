import { describe, expect, it } from 'vite-plus/test';
import { Computation, Signal } from '../../../src/core/reactive/graph';
import { Owner } from '../../../src/core/reactive/owner';
import {
  clearScheduler,
  effectScheduler,
  flushSync,
} from '../../../src/core/reactive/scheduler';

function effect(fn: () => void, owner: Owner | null = null) {
  const c = new Computation(owner, fn, effectScheduler('effect'), null);
  c.update();
  return c;
}

describe('reactive graph subscriptions', () => {
  it('should see a write to a source first read in the same run', () => {
    clearScheduler();
    const count = new Signal(0);
    const seen: number[] = [];
    effect(() => {
      const value = count.read();
      seen.push(value);
      if (value < 3) count.write(value + 1);
    });
    flushSync();
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(count.peek()).toBe(3);
  });

  it('should see a write to a newly read source on a later run', () => {
    clearScheduler();
    const gate = new Signal(false);
    const inner = new Signal(0);
    const seen: Array<[boolean, number]> = [];
    effect(() => {
      const open = gate.read();
      if (!open) {
        seen.push([open, -1]);
        return;
      }
      const value = inner.read();
      seen.push([open, value]);
      if (value < 2) inner.write(value + 1);
    });
    flushSync();
    gate.write(true);
    flushSync();
    expect(seen).toEqual([
      [false, -1],
      [true, 0],
      [true, 1],
      [true, 2],
    ]);
  });
});

describe('owner tree disposal', () => {
  it('should dispose a computation created under an already disposed owner', () => {
    const parent = new Owner(null);
    parent.dispose();
    const source = new Signal(1);
    const orphan = new Computation(parent, () => source.read(), null);
    orphan.read();
    expect(orphan.disposed).toBe(true);
    expect(source._observers?.size ?? 0).toBe(0);
  });

  it('should run cleanups registered under a disposed owner immediately', () => {
    const parent = new Owner(null);
    parent.dispose();
    let cleaned = false;
    parent.onCleanup(() => {
      cleaned = true;
    });
    expect(cleaned).toBe(true);
  });
});
