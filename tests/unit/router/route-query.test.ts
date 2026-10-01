import { describe, expect, it } from 'vite-plus/test';
import { makeQuery } from '../../../src/router/route-context';

describe('route query serialization', () => {
  it.each([
    ['?__proto__=one', 'one'],
    ['?__proto__=one&__proto__=two', ['one', 'two']],
  ])(
    'should retain __proto__ as an own query key for %s',
    (search, expected) => {
      const query = makeQuery(search as string);
      const serialized = query.toJSON();

      expect(query.get('__proto__')).toBe('one');
      expect(Object.hasOwn(serialized, '__proto__')).toBe(true);
      expect(serialized['__proto__']).toEqual(expected);
      expect(Object.getPrototypeOf(serialized)).toBe(Object.prototype);
      expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
    }
  );
});
