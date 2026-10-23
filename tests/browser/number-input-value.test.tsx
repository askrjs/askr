import { afterEach, expect, test } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser';
import { cleanupApp, createIsland } from '@askrjs/askr/boot';
import { state } from '@askrjs/askr';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

test('should not rewrite a number input while the user types a decimal point or exponent', async () => {
  const { container, cleanup } = createTestContainer();
  cleanups.push(() => {
    cleanupApp(container);
    cleanup();
  });
  createIsland({
    root: container,
    component: () => {
      const amount = state(0);
      return (
        <input
          aria-label="amount"
          type="number"
          value={amount()}
          onInput={(event: Event) => {
            const text = (event.target as HTMLInputElement).value;
            if (text !== '') amount.set(Number(text));
          }}
        />
      );
    },
  });
  flushScheduler();
  const input = container.querySelector('input')!;
  input.focus();
  input.select();
  await userEvent.keyboard('1.');
  flushScheduler();
  expect(
    input.validity.badInput || input.value === '1' || input.value === '1.'
  ).toBe(true);
  await userEvent.keyboard('5');
  flushScheduler();
  expect(input.value).toBe('1.5');
  await userEvent.keyboard('e');
  flushScheduler();
  await userEvent.keyboard('2');
  flushScheduler();
  expect(input.value).toBe('1.5e2');
});
