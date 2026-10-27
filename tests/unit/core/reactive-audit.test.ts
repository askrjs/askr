import { describe, expect, it } from 'vite-plus/test';
import { Computation, Signal } from '../../../src/core/reactive/graph';
import { Owner } from '../../../src/core/reactive/owner';
import { createStateCell } from '../../../src/core/api/state';
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
  it('should not track reads made by a state equality comparator', () => {
    clearScheduler();
    const trigger = new Signal(0);
    const side = new Signal(0);
    const cell = createStateCell(
      new Signal(0, (previous, next) => {
        side.read();
        return previous === next;
      })
    );
    let runs = 0;
    const computation = effect(() => {
      runs++;
      trigger.read();
      cell.set(1);
    });

    trigger.write(1);
    flushSync();
    const settledRuns = runs;
    side.write(1);
    flushSync();

    expect(runs).toBe(settledRuns);
    computation.dispose();
  });

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

describe('reactive graph derived invalidation during a run', () => {
  it('should re-run when a derived value read in the run is invalidated later in it', () => {
    clearScheduler();
    const count = new Signal(0);
    const doubled = new Computation(null, () => count.read() * 2, null);
    const seen: number[] = [];
    effect(() => {
      const value = doubled.read();
      seen.push(value);
      if (value < 4) count.write(count.peek() + 1);
    });
    flushSync();
    expect(seen).toEqual([0, 2, 4]);
    expect(count.peek()).toBe(2);
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
