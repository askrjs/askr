import { describe, expect, it } from 'vite-plus/test';
import { mergeProps } from '../../../src/foundations/utilities/merge-props';

describe('mergeProps special property names', () => {
  it.each([null, 'text', { inherited: true }])(
    'should preserve an own __proto__ base value %j without changing the output prototype',
    (value) => {
      const base = JSON.parse('{"__proto__":null}') as Record<string, unknown>;
      base.__proto__ = value;

      const result = mergeProps(base, { title: 'injected' });

      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(
        true
      );
      expect(result.__proto__).toBe(value);
      expect(result.title).toBe('injected');
      expect(Object.keys(result)).toEqual(['title', '__proto__']);
    }
  );

  it('should keep undefined base values absent when __proto__ was injected', () => {
    const injected = JSON.parse('{"__proto__":{"id":"injected"}}') as Record<
      string,
      unknown
    >;
    const base = JSON.parse('{"__proto__":null}') as Record<string, unknown>;
    base.__proto__ = undefined;

    const result = mergeProps(base, injected);

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(
      true
    );
    expect(result.__proto__).toBe(injected.__proto__);
  });
});
