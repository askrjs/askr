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
  it('should handle initial and direct evaluation errors consistently', () => {
    const source = createSource(1);
    const errors: unknown[] = [];
    const commits: number[] = [];
    let shouldThrow = true;

    const effect = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => {
        const value = source.read();
        if (shouldThrow) {
          throw new Error('effect-compute-boom');
        }
        return value;
      },
      commit: (value) => {
        commits.push(value);
      },
      onError: (error) => {
        errors.push(error);
      },
    });

    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('effect-compute-boom');

    shouldThrow = false;
    source.set(2);
    globalScheduler.flush();
    expect(commits).toEqual([2]);

    shouldThrow = true;
    expect(() => effect.flush()).not.toThrow();
    expect(errors).toHaveLength(2);

    expect(() =>
      effect.updateCompute(() => {
        source.read();
        throw new Error('updated-compute-boom');
      })
    ).not.toThrow();
    expect(errors).toHaveLength(3);
    expect(String(errors[2])).toContain('updated-compute-boom');

    effect.cleanup();
  });

  it('should rethrow and retire an unhandled initial evaluation failure', () => {
    const source = createSource(1);
    let runs = 0;

    expect(() =>
      createFineGrainedEffect({
        lane: 'reactive',
        compute: () => {
          runs += 1;
          source.read();
          throw new Error('unhandled-initial-boom');
        },
        commit: () => {},
      })
    ).toThrow(/unhandled-initial-boom/);

    source.set(2);
    expect(() => globalScheduler.flush()).not.toThrow();
    expect(runs).toBe(1);
  });

  it('should roll back an unhandled updateCompute replacement', () => {
    const original = createSource(1);
    const replacement = createSource(10);
    const commits: number[] = [];
    let originalRuns = 0;
    let replacementRuns = 0;
    let shouldThrowCommit = false;

    const effect = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => {
        originalRuns += 1;
        return original.read();
      },
      commit: (value) => {
        if (shouldThrowCommit) {
          throw new Error('unhandled-update-commit-boom');
        }
        commits.push(value);
      },
    });

    expect(() =>
      effect.updateCompute(() => {
        replacementRuns += 1;
        replacement.read();
        throw new Error('unhandled-update-compute-boom');
      })
    ).toThrow(/unhandled-update-compute-boom/);

    replacement.set(11);
    expect(() => globalScheduler.flush()).not.toThrow();
    expect(replacementRuns).toBe(1);

    shouldThrowCommit = true;
    expect(() =>
      effect.updateCompute(() => {
        replacementRuns += 1;
        return replacement.read();
      })
    ).toThrow(/unhandled-update-commit-boom/);
    shouldThrowCommit = false;

    replacement.set(12);
    expect(() => globalScheduler.flush()).not.toThrow();
    expect(replacementRuns).toBe(2);

    original.set(2);
    expect(() => globalScheduler.flush()).not.toThrow();
    expect(originalRuns).toBe(2);
    expect(commits).toEqual([1, 2]);

    effect.cleanup();
  });

  it('should keep an existing effect recoverable after an unhandled flush', () => {
    const source = createSource(1);
    const commits: number[] = [];
    let shouldThrow = false;
    let runs = 0;

    const effect = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => {
        runs += 1;
        const value = source.read();
        if (shouldThrow) {
          throw new Error('unhandled-flush-boom');
        }
        return value;
      },
      commit: (value) => {
        commits.push(value);
      },
    });

    shouldThrow = true;
    expect(() => effect.flush()).toThrow(/unhandled-flush-boom/);

    shouldThrow = false;
    source.set(2);
    expect(() => globalScheduler.flush()).not.toThrow();
    expect(runs).toBe(3);
    expect(commits).toEqual([1, 2]);

    effect.cleanup();
  });

  it('should publish successful compute subscriptions when commit throws', () => {
    const branch = createSource(0);
    const first = createSource(1);
    const second = createSource(10);
    const errors: unknown[] = [];
    const committed: number[] = [];
    let shouldThrow = true;
    let runs = 0;

    const effect = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => {
        runs += 1;
        return branch.read() === 0 ? first.read() : second.read();
      },
      commit: (value) => {
        if (shouldThrow) {
          throw new Error('effect-commit-boom');
        }
        committed.push(value);
      },
      onError: (error) => {
        errors.push(error);
      },
    });

    expect(errors).toHaveLength(1);
    expect(runs).toBe(1);

    shouldThrow = false;
    first.set(2);
    globalScheduler.flush();
    expect(runs).toBe(2);
    expect(committed).toEqual([2]);

    shouldThrow = true;
    branch.set(1);
    globalScheduler.flush();
    expect(errors).toHaveLength(2);
    expect(runs).toBe(3);

    shouldThrow = false;
    first.set(3);
    globalScheduler.flush();
    expect(runs).toBe(3);

    second.set(11);
    globalScheduler.flush();
    expect(runs).toBe(4);
    expect(committed).toEqual([2, 11]);

    effect.cleanup();
  });

  it('should surface unhandled scheduled failures after draining siblings', () => {
    const source = createSource(0);
    let safeRuns = 0;

    const throwing = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => source.read(),
      commit: (value) => {
        if (value === 1) {
          throw new Error('unhandled-effect-boom');
        }
      },
    });
    const safe = createFineGrainedEffect({
      lane: 'reactive',
      compute: () => source.read(),
      commit: () => {
        safeRuns += 1;
      },
    });

    source.set(1);
    expect(() => globalScheduler.flush()).toThrow(/unhandled-effect-boom/);
    expect(safeRuns).toBe(2);

    throwing.cleanup();
    safe.cleanup();
  });

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
