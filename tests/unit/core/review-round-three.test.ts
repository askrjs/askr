import { describe, expect, it } from 'vite-plus/test';
import { Computation, Signal } from '../../../src/core/reactive/graph';
import { makeReactiveFields } from '../../../src/core/api/snapshot';
import {
  clearScheduler,
  effectScheduler,
  flushSync,
} from '../../../src/core/reactive/scheduler';

function effect(fn: () => void) {
  const c = new Computation(null, fn, effectScheduler('effect'), null);
  c.update();
  return c;
}

describe('reactive snapshot fields', () => {
  it('should notify readers when the same mutable object is assigned again', () => {
    clearScheduler();
    const snapshot = makeReactiveFields({ value: [] as number[] }, ['value']);
    const seen: number[] = [];
    effect(() => {
      seen.push(snapshot.value.length);
    });
    const buffer = snapshot.value;
    buffer.push(1);
    snapshot.value = buffer;
    flushSync();
    buffer.push(2);
    snapshot.value = buffer;
    flushSync();
    expect(seen).toEqual([0, 1, 2]);
  });
});

describe('stale chain walk', () => {
  it('should keep a derived computation stale when its comparator throws', () => {
    const source = new Signal(1);
    let throwOnce = true;
    const derived = new Computation(
      null,
      () => source.read() * 10,
      null,
      (previous, next) => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('equals failed');
        }
        return Object.is(previous, next);
      }
    );
    expect(derived.read()).toBe(10);
    source.write(2);
    expect(() => derived.read()).toThrow('equals failed');
    expect(derived.read()).toBe(20);
  });

  it('should recover after a comparator throws during the walk', () => {
    clearScheduler();
    const a = new Signal(1);
    let throwOnce = true;
    const mid = new Computation(
      null,
      () => a.read() * 10,
      null,
      (previous, next) => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('equals failed');
        }
        return Object.is(previous, next);
      }
    );
    const top = new Computation(null, () => mid.read() + 1, null);
    const outer = new Computation(null, () => top.read() + 1, null);
    expect(outer.read()).toBe(12);
    a.write(2);
    expect(() => outer.read()).toThrow('equals failed');
    expect(outer.read()).toBe(22);
    a.write(3);
    expect(outer.read()).toBe(32);
    a.write(7);
    expect(outer.read()).toBe(72);
  });
});
