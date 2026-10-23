import { expect, test } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function setup(initial: number) {
  const { container, cleanup } = createTestContainer();
  let value!: State<number>;
  let tick!: State<number>;
  createIsland({
    root: container,
    component: () => {
      value = state(initial);
      tick = state(0);
      return (
        <div data-tick={tick()}>
          <input type="number" value={value()} />
        </div>
      );
    },
  });
  flushScheduler();
  return {
    input: container.querySelector('input')!,
    value,
    tick,
    cleanup,
  };
}

test('should not overwrite a number input whose text equals the value numerically', () => {
  const { input, tick, cleanup } = setup(1);
  try {
    input.value = '1.0';
    expect(input.value).toBe('1.0');
    tick.set(1);
    flushScheduler();
    expect(input.value).toBe('1.0');
  } finally {
    cleanup();
  }
});

test('should overwrite a number input whose text differs numerically', () => {
  const { input, value, cleanup } = setup(1);
  try {
    input.value = '2';
    value.set(3);
    flushScheduler();
    expect(input.value).toBe('3');
  } finally {
    cleanup();
  }
});

test('should restore a number input to the rendered value when the user text differs', () => {
  const { input, tick, cleanup } = setup(1);
  try {
    input.value = '5';
    tick.set(1);
    flushScheduler();
    expect(input.value).toBe('1');
  } finally {
    cleanup();
  }
});
