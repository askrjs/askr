import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createMutation, getDefaultDataRuntime } from '../../../src/data';

afterEach(() => {
  getDefaultDataRuntime().queryData.clear();
});

describe('mutation-cell invalidate-even-when-superseded (regression for #357)', () => {
  it("should invalidate the superseded submission's own affected prefix using its own input/result, without letting it overwrite the visible mutation state", async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    getDefaultDataRuntime().queryData.set('item:a:detail', { stale: true });
    getDefaultDataRuntime().queryData.set('item:b:detail', { stale: true });

    const mutation = createMutation({
      action: (input: string) =>
        new Promise<string>((resolve) => {
          if (input === 'a') resolveFirst = resolve;
          else resolveSecond = resolve;
        }),
      affects: (input: string, result: string) => {
        expect(result).toBe(`committed-${input}`);
        return [`item:${input}:`];
      },
      afterSuccess: 'invalidate',
    });

    const first = mutation.execute('a');
    const second = mutation.execute('b');

    // The superseded ('a') submission commits remotely after being
    // overtaken by 'b'. It must still invalidate its own affected prefix.
    resolveFirst('committed-a');
    await expect(first).resolves.toBe('committed-a');

    // Its own prefix is invalidated using the superseded call's own
    // input/result pair, not the newer generation's.
    expect(getDefaultDataRuntime().queryData.has('item:a:detail')).toBe(false);
    // The unrelated prefix for the still-pending current submission must be
    // untouched by the superseded submission's invalidation.
    expect(getDefaultDataRuntime().queryData.has('item:b:detail')).toBe(true);

    // Crucially, the superseded submission's success must NOT overwrite the
    // visible mutation state, which still belongs to the current ('b') op.
    expect(mutation.status).toBe('pending');
    expect(mutation.result).toBe(null);

    resolveSecond('committed-b');
    await expect(second).resolves.toBe('committed-b');
    expect(getDefaultDataRuntime().queryData.has('item:b:detail')).toBe(false);
    expect(mutation.status).toBe('success');
    expect(mutation.result).toBe('committed-b');
  });
});
