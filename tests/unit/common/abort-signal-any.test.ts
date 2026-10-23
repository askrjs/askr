import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { anyAbortSignal } from '../../../src/common/abort-signal';

describe('anyAbortSignal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should abort when any input aborts and forward its reason', () => {
    const first = new AbortController();
    const second = new AbortController();
    const combined = anyAbortSignal([first.signal, second.signal]);
    expect(combined.aborted).toBe(false);
    const reason = new Error('stop');
    second.abort(reason);
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe(reason);
  });

  it('should be aborted at once when an input already is', () => {
    const done = new AbortController();
    done.abort('already');
    const combined = anyAbortSignal([
      new AbortController().signal,
      done.signal,
    ]);
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe('already');
  });

  it('should work on a host without AbortSignal.any', () => {
    const NativeSignal = AbortSignal;
    const Stub = Object.assign(function AbortSignalStub() {}, {
      abort: NativeSignal.abort.bind(NativeSignal),
      timeout: NativeSignal.timeout,
    });
    vi.stubGlobal('AbortSignal', Stub);
    expect((AbortSignal as { any?: unknown }).any).toBeUndefined();

    const first = new AbortController();
    const second = new AbortController();
    const combined = anyAbortSignal([first.signal, second.signal]);
    expect(combined.aborted).toBe(false);
    first.abort('first');
    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe('first');
    // Later aborts of other inputs change nothing.
    second.abort('second');
    expect(combined.reason).toBe('first');

    const done = new AbortController();
    done.abort('already');
    expect(anyAbortSignal([done.signal]).aborted).toBe(true);
  });

  it('should not retain listeners on inputs that did not abort', () => {
    const NativeSignal = AbortSignal;
    vi.stubGlobal(
      'AbortSignal',
      Object.assign(function AbortSignalStub() {}, {
        abort: NativeSignal.abort.bind(NativeSignal),
      })
    );
    const first = new AbortController();
    const second = new AbortController();
    const remove = vi.spyOn(second.signal, 'removeEventListener');
    anyAbortSignal([first.signal, second.signal]);
    first.abort();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
