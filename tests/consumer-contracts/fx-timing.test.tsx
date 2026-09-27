import { expect, test } from 'vitest';
import { debounce, throttle, raf } from '@askrjs/askr/fx';

test('should type installed timing calls as void', () => {
  const delayed = debounce(() => 42, 1);
  const limited = throttle(() => 42, 1);
  const result: void = delayed();
  const leading: void = limited();
  expect(result).toBeUndefined();
  expect(leading).toBeUndefined();
  delayed.cancel();
  limited.cancel();
  const frame: (value: number) => void = raf((value: number) => value);
  expect(typeof frame).toBe('function');
});
