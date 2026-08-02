import { describe, expect, it } from 'vite-plus/test';
import type { RouteContext } from '../../../src/common/router';
import { defer, reviveDeferredValue } from '../../../src/router/deferred';
import {
  prepareRouteHydrationData,
  validateRouteHydrationData,
} from '../../../src/router/route-hydration';

const context: RouteContext = {
  mode: 'ssr',
  params: { slug: 'hello' },
  pathname: '/posts/hello',
  search: '',
  hash: '',
  href: '/posts/hello',
  auth: {
    authenticated: false,
    principal: null,
    session: null,
    tenant: null,
  },
  signal: new AbortController().signal,
};

const sparse: unknown[] = [];
sparse.length = 2;

describe('route hydration transport', () => {
  it.each([
    null,
    true,
    'text',
    0,
    -10.5,
    [1, 'two', null],
    { nested: { dense: [true, false] } },
    Object.assign(Object.create(null), { safe: 'value' }),
    defer(new Promise<string>(() => undefined)),
    reviveDeferredValue('fulfilled', { safe: true }, undefined),
    reviveDeferredValue('rejected', undefined, new Error('expected')),
  ])('should accept JSON transport values and deferred encoding', (value) => {
    expect(() => validateRouteHydrationData(value, '/accepted')).not.toThrow();
  });

  it.each([
    ['undefined', { value: undefined }, '$.value'],
    ['function', { value: () => null }, '$.value'],
    ['symbol', { value: Symbol('value') }, '$.value'],
    ['bigint', { value: 1n }, '$.value'],
    ['non-finite number', { value: Number.POSITIVE_INFINITY }, '$.value'],
    ['Date', { value: new Date(0) }, '$.value'],
    ['Map', { value: new Map() }, '$.value'],
    ['Set', { value: new Set() }, '$.value'],
    [
      'class instance',
      {
        value: new (class RouteModel {
          readonly value = 'server';
        })(),
      },
      '$.value',
    ],
    ['sparse array', { value: sparse }, '$.value[0]'],
  ])(
    'should reject %s with the route and property path',
    (_name, value, path) => {
      let message = '';
      try {
        validateRouteHydrationData(value, '/posts/hello');
      } catch (error) {
        message = String(error);
      }
      expect(message).toContain('/posts/hello');
      expect(message).toContain(path);
    }
  );

  it('should reject accessors without invoking them', () => {
    const getter = () => {
      throw new Error('must not run');
    };
    const value = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: getter,
    });

    expect(() => validateRouteHydrationData(value, '/accessor')).toThrow(
      /\/accessor.*\$\.secret.*accessors/
    );
  });

  it('should reject a deferred marker accessor without invoking it', () => {
    const value = Object.defineProperty(
      {},
      Symbol.for('@askrjs/askr/deferred-value'),
      {
        get: () => {
          throw new Error('must not run');
        },
      }
    );

    expect(() => validateRouteHydrationData(value, '/accessor')).toThrow(
      /symbol-keyed properties/
    );
  });

  it('should reject numeric named array properties that JSON would omit', () => {
    const value = [true];
    Object.defineProperty(value, '4294967295', {
      value: false,
      enumerable: true,
    });

    expect(() => validateRouteHydrationData(value, '/array')).toThrow(
      /named array properties/
    );
  });

  it('should reject cyclic values at the concrete property path', () => {
    const value: { child?: unknown } = {};
    value.child = value;

    expect(() => validateRouteHydrationData(value, '/cycle')).toThrow(
      /\/cycle.*\$\.child.*cyclic/
    );
  });

  it('should retain a compact omission map for selected branches', () => {
    const prepared = prepareRouteHydrationData(
      {
        public: 'safe',
        secret: 'server-only',
        nested: { kept: true, omitted: false },
      },
      (data) => {
        const value = data as {
          public: string;
          nested: { kept: boolean };
        };
        return { public: value.public, nested: { kept: value.nested.kept } };
      },
      context
    );

    expect(prepared.data).toEqual({
      public: 'safe',
      nested: { kept: true },
    });
    expect(prepared.metadata).toEqual({
      r: '/posts/hello',
      o: { secret: 1, nested: { omitted: 1 } },
    });
  });

  it('should reject asynchronous dehydrate selectors', () => {
    expect(() =>
      prepareRouteHydrationData(
        { public: 'safe' },
        async (data) => data,
        context
      )
    ).toThrow(/dehydrate\(\).*must be synchronous/);
  });
});
