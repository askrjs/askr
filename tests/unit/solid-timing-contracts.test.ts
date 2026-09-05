import { afterEach, expect, test, vi } from 'vite-plus/test';
import { debounce, throttle, raf } from '../../src/fx/timing';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test.each([debounce, throttle])(
  'should retain the latest receiver and arguments when coalescing',
  (wrap) => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const wrapped = wrap(
      function (this: { label: string }, value: number) {
        calls.push(`${this.label}:${value}`);
        return value;
      },
      10,
      { leading: false }
    );
    wrapped.call({ label: 'first' }, 1);
    wrapped.call({ label: 'last' }, 2);
    vi.advanceTimersByTime(10);
    expect(calls).toEqual(['last:2']);
    wrapped.call({ label: 'cancelled' }, 3);
    wrapped.cancel();
    vi.advanceTimersByTime(10);
    expect(calls).toEqual(['last:2']);
  }
);

test('should retain the latest RAF receiver and arguments', () => {
  let frame!: () => void;
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    frame = callback;
    return 1;
  });
  const calls: string[] = [];
  const wrapped = raf(function (this: { label: string }, value: number) {
    calls.push(`${this.label}:${value}`);
  });
  wrapped.call({ label: 'first' }, 1);
  wrapped.call({ label: 'last' }, 2);
  expect(calls).toEqual([]);
  frame();
  expect(calls).toEqual(['last:2']);
});

test.each([debounce, throttle])('timing wrappers return void', (wrap) => {
  vi.useFakeTimers();
  const wrapped = wrap(() => 42, 10);
  const result: void = wrapped();
  wrapped.cancel();
  expect(result).toBeUndefined();
});

test('should raf returns void', () => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  const result: void = raf(() => 42)();
  expect(result).toBeUndefined();
});
