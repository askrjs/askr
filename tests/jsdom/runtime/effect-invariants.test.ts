import { describe, expect, it } from 'vite-plus/test';
import {
  createFineGrainedEffect,
  markFineGrainedEffectsDirtySource,
} from '../../../src/runtime/effect';
import {
  recordReadableRead,
  type ReadableSource,
} from '../../../src/runtime/readable';
import { globalScheduler } from '../../../src/runtime/scheduler';

function createSource(initialValue: number): {
  read: ReadableSource<number>;
  set(value: number): void;
} {
  let value = initialValue;
  const read = (() => {
    recordReadableRead(read);
    return value;
  }) as ReadableSource<number>;

  return {
    read,
    set(nextValue) {
      value = nextValue;
      markFineGrainedEffectsDirtySource(read);
    },
  };
}

describe('fine-grained effect invariants', () => {
  it('should preserve outer dependencies across nested effect evaluation', () => {
    const first = createSource(1);
    const second = createSource(10);
    const nestedSource = createSource(100);
    const committed: number[] = [];
    const nested = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => nestedSource.read(),
      commit: () => {},
    });
    const outer = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => {
        const firstValue = first.read();
        nested.flush();
        return firstValue + second.read();
      },
      commit: (value) => {
        committed.push(value);
      },
    });

    first.set(2);
    globalScheduler.flush();

    expect(committed).toEqual([11, 12]);

    outer.cleanup();
    nested.cleanup();
  });

  it('should update subscriptions while moving between one, two, and three sources', () => {
    const first = createSource(1);
    const second = createSource(10);
    const third = createSource(100);
    let sourceCount = 2;
    let runs = 0;

    const effect = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => {
        runs += 1;
        let value = first.read();
        if (sourceCount >= 2) value += second.read();
        if (sourceCount >= 3) value += third.read();
        return value;
      },
      commit: () => {},
    });

    second.set(11);
    globalScheduler.flush();
    expect(runs).toBe(2);

    sourceCount = 1;
    effect.flush();
    expect(runs).toBe(3);
    second.set(12);
    globalScheduler.flush();
    expect(runs).toBe(3);

    sourceCount = 3;
    effect.flush();
    expect(runs).toBe(4);
    third.set(101);
    globalScheduler.flush();
    expect(runs).toBe(5);

    sourceCount = 2;
    effect.flush();
    expect(runs).toBe(6);
    third.set(102);
    globalScheduler.flush();
    expect(runs).toBe(6);

    effect.cleanup();
    first.set(2);
    second.set(13);
    globalScheduler.flush();
    expect(runs).toBe(6);
  });

  it('should report a bounded failure for self-invalidating effects', () => {
    const source = createSource(0);
    let cycleError: unknown = null;
    let commits = 0;

    const effect = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => source.read(),
      commit: (value) => {
        commits += 1;
        if (value > 0 && value < 61) {
          source.set(value + 1);
        }
      },
      onError: (error) => {
        cycleError = error;
      },
    });

    source.set(1);
    globalScheduler.flush();

    expect(cycleError).toBeInstanceOf(Error);
    expect(String(cycleError)).toMatch(/cycle|depth|loop/i);
    expect(commits).toBeLessThanOrEqual(51);

    effect.cleanup();
  });
});
