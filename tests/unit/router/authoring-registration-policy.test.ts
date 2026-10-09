import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  createRouteRegistry,
  fallback,
  index,
  page,
} from '../../../src/router/route';
import type { InternalRouteRecord } from '../../../src/router/internal-types';
import { resolveRouteFromRoutes } from '../../../src/router/route-matching';
import {
  clearRouteState,
  getRouteRecords,
  lockRouteRegistration,
} from '../../../src/router/store';

afterEach(() => clearRouteState());

describe('route record registration policy', () => {
  it.each([
    ['index', () => index(() => null)],
    ['fallback', () => fallback(() => null)],
  ] as const)(
    'should reject %s registration after the active table is locked',
    (_name, register) => {
      lockRouteRegistration();
      expect(register).toThrow(/locked after app startup/i);
      expect(getRouteRecords()).toEqual([]);
    }
  );

  it.each([
    ['index', () => index({} as never)],
    ['fallback', () => fallback({} as never)],
  ] as const)(
    'should reject a non-function %s component without registering a record',
    (_name, register) => {
      expect(register).toThrow(/requires a component function/i);
      expect(getRouteRecords()).toEqual([]);
    }
  );

  it('should allow one valid index after a failed index registration in the same page scope', () => {
    const registry = createRouteRegistry(() => {
      page(
        '/docs',
        () => null,
        () => {
          expect(() => index({} as never)).toThrow(
            /requires a component function/i
          );
          index(() => 'overview');
        }
      );
    });
    expect(registry.manifest.records.map((record) => record.path)).toEqual([
      '/docs',
    ]);
  });

  it('should join a root page fallback with one slash and retain its page ownership', () => {
    const Page = () => null;
    const Missing = () => 'missing';
    const registry = createRouteRegistry(() => {
      page('/', Page, () => {
        index(() => 'home');
        fallback(Missing);
      });
    });
    const record = registry.manifest.records.find(
      (record) => record.isFallback
    )! as InternalRouteRecord;
    expect(record.path).toBe('/*');
    expect(record.fallbackPrefix).toBe('/');
    expect(record.pageChain).toEqual([{ component: Page }]);
    expect(resolveRouteFromRoutes('/unknown', registry.routes)?.handler).toBe(
      record.handler
    );
  });
});
