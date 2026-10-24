import { afterEach, describe, expect, it } from 'vite-plus/test';
import { resetRouterState } from '../../../src/router/reset';
import { route, unloadNamespace } from '../../../src/router/route';
import { resolveRoute } from '../../../src/router/route-matching';

/**
 * The live route table is indexed for matching. Registration, namespace
 * unloading and reset must keep the index and the duplicate check in step
 * with the records.
 */
describe('route table index lifecycle', () => {
  afterEach(() => resetRouterState());

  it('should match routes registered after an earlier match', () => {
    route('/users/{id}', () => 'user');
    expect(resolveRoute('/users/me')?.params).toEqual({ id: 'me' });
    route('/users/me', () => 'me');
    expect(resolveRoute('/users/me')?.params).toEqual({});
  });

  it('should stop matching routes of an unloaded namespace', () => {
    route('/shop/{sku}', () => 'sku', { namespace: 'shop' });
    route('/shop/cart', () => 'cart');
    expect(resolveRoute('/shop/x')).not.toBeNull();
    unloadNamespace('shop');
    expect(resolveRoute('/shop/x')).toBeNull();
    expect(resolveRoute('/shop/cart')).not.toBeNull();
    route('/shop/{sku}', () => 'sku-again', { namespace: 'shop' });
    expect(resolveRoute('/shop/x')?.params).toEqual({ sku: 'x' });
  });

  it('should still reject a duplicate match shape after indexing', () => {
    route('/users/{id}', () => 'user');
    expect(() => route('/users/{userId}', () => 'other')).toThrow(
      /Duplicate route path/
    );
    expect(() => route('/users/*', () => 'other')).toThrow(
      /Duplicate route path/
    );
  });
});
