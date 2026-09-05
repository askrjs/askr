import { afterEach, expect, test, vi } from 'vite-plus/test';
import { debounce, throttle, raf } from '../../src/fx/timing';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
