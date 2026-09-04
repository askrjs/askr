// @vitest-environment node
import { expect, test } from 'vitest';
import { state } from '@askrjs/askr';
import { watch } from '@askrjs/askr/resources';
import {
  createRenderContext,
  getRenderContext,
  renderToString,
  withRenderContext,
} from '@askrjs/askr/ssr';

test('should render synchronously without browser globals or client effects', () => {
  expect(typeof document).toBe('undefined');
  expect(typeof window).toBe('undefined');
  const effects: number[] = [];
  expect(
    renderToString(() => {
      const value = state(42);
      watch(value, (next) => {
        effects.push(next);
      });
      return <output>{value()}</output>;
    })
  ).toContain('42');
  expect(effects).toEqual([]);
});

test('should restore nested request context after synchronous failures', () => {
  const previous = getRenderContext();
  const outer = createRenderContext(1, { url: '/outer' });
  const inner = createRenderContext(2, { url: '/inner' });
  const failure = new Error('inner render');
  withRenderContext(outer, () => {
    expect(getRenderContext()).toBe(outer);
    expect(() =>
      withRenderContext(inner, () => {
        expect(getRenderContext()).toBe(inner);
        throw failure;
      })
    ).toThrow(failure);
    expect(getRenderContext()).toBe(outer);
  });
  expect(getRenderContext()).toBe(previous);
});
