import { expect, test } from 'vite-plus/test';
import {
  composeRefs,
  setRef,
} from '../../src/foundations/utilities/compose-ref';

test('should a throwing callback ref does not prevent later refs from receiving disposal', () => {
  const later = { current: 'mounted' as string | null };
  const ref = composeRefs<string>(() => {
    throw new Error('ref failed');
  }, later);
  try {
    ref(null);
  } catch {
    /* Error policy is separate from draining siblings. */
  }
  expect(later.current).toBeNull();
});

test.each(['mounted', null])(
  'drains callbacks in order for %s and aggregates failures',
  (value) => {
    const first = new Error('first');
    const second = new Error('second');
    const events: string[] = [];
    const target = { current: null as string | null };
    const ref = composeRefs<string>(
      () => {
        events.push('first');
        throw first;
      },
      Object.freeze({ current: null }),
      () => {
        events.push('second');
        throw second;
      },
      target,
      () => {
        events.push('last');
      }
    );
    expect(() => ref(value)).toThrow(AggregateError);
    try {
      ref(value);
    } catch (error) {
      expect((error as AggregateError).errors).toEqual([first, second]);
    }
    expect(events).toEqual([
      'first',
      'second',
      'last',
      'first',
      'second',
      'last',
    ]);
    expect(target.current).toBe(value);
    expect(() =>
      setRef(() => {
        throw first;
      }, value)
    ).toThrow(first);
  }
);
