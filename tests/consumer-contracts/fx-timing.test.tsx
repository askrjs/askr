import { expect, test } from 'vitest';
import { throttle, raf } from '@askrjs/askr/fx';

test('should type installed timing calls as void', () => {
  const limited = throttle(() => 42, 1);
  const leading: void = limited();
  expect(leading).toBeUndefined();
  limited.cancel();
  const frame: (value: number) => void = raf((value: number) => value);
  expect(typeof frame).toBe('function');
});
