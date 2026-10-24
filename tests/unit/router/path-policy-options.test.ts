import { describe, expect, it } from 'vite-plus/test';
import {
  createRouteRegistry,
  resolveRouteRequest,
  route,
} from '../../../src/router';

const routes = () => {
  route('/', () => null);
  route('/about', () => null);
  route('/users/{name}', () => null);
  route('/files/report.pdf', () => null);
};

describe('trailingSlash registry option', () => {
  it('should preserve both URL forms with an explicit ignore policy', async () => {
    const registry = createRouteRegistry(routes, { trailingSlash: 'ignore' });
    for (const target of ['/about?a=1#x', '/about/?a=1#x']) {
      expect((await resolveRouteRequest(target, { registry }))?.kind).toBe(
        'render'
      );
    }
  });

  it('should leave both forms matching by default', async () => {
    const registry = createRouteRegistry(routes);
    expect((await resolveRouteRequest('/about/', { registry }))?.kind).toBe(
      'render'
    );
    expect((await resolveRouteRequest('/about', { registry }))?.kind).toBe(
      'render'
    );
  });

  it('should redirect to the form without a trailing slash with never', async () => {
    const registry = createRouteRegistry(routes, { trailingSlash: 'never' });
    expect(await resolveRouteRequest('/about/?a=1#x', { registry })).toEqual({
      kind: 'redirect',
      to: '/about?a=1#x',
      status: 308,
      replace: false,
    });
    expect((await resolveRouteRequest('/about', { registry }))?.kind).toBe(
      'render'
    );
    expect((await resolveRouteRequest('/', { registry }))?.kind).toBe('render');
  });

  it('should redirect to the form with a trailing slash with always', async () => {
    const registry = createRouteRegistry(routes, { trailingSlash: 'always' });
    expect(await resolveRouteRequest('/about?a=1', { registry })).toEqual({
      kind: 'redirect',
      to: '/about/?a=1',
      status: 308,
      replace: false,
    });
    expect((await resolveRouteRequest('/about/', { registry }))?.kind).toBe(
      'render'
    );
    expect((await resolveRouteRequest('/', { registry }))?.kind).toBe('render');
  });

  it('should not redirect file-like paths or unmatched paths with always', async () => {
    const registry = createRouteRegistry(routes, { trailingSlash: 'always' });
    expect(
      (await resolveRouteRequest('/files/report.pdf', { registry }))?.kind
    ).toBe('render');
    expect(await resolveRouteRequest('/missing', { registry })).toBeNull();
  });

  it('should keep the base path on the redirect target', async () => {
    const registry = createRouteRegistry(routes, {
      trailingSlash: 'never',
      basePath: '/app',
    });
    expect(
      await resolveRouteRequest('/app/about/', { registry })
    ).toMatchObject({ kind: 'redirect', to: '/app/about' });
  });

  it('should reject an unknown policy', () => {
    expect(() =>
      createRouteRegistry(routes, { trailingSlash: 'sometimes' as never })
    ).toThrow(TypeError);
  });
});

describe('caseSensitive registry option', () => {
  it('should not match a different case by default', async () => {
    const registry = createRouteRegistry(routes);
    expect(await resolveRouteRequest('/About', { registry })).toBeNull();
  });

  it('should redirect a different case of static segments to the declared case', async () => {
    const registry = createRouteRegistry(routes, { caseSensitive: false });
    expect(await resolveRouteRequest('/About?a=1', { registry })).toEqual({
      kind: 'redirect',
      to: '/about?a=1',
      status: 308,
      replace: false,
    });
    expect(await resolveRouteRequest('/USERS/Ada', { registry })).toMatchObject(
      { kind: 'redirect', to: '/users/Ada' }
    );
    expect((await resolveRouteRequest('/about', { registry }))?.kind).toBe(
      'render'
    );
  });

  it('should compose with trailingSlash', async () => {
    const registry = createRouteRegistry(routes, {
      caseSensitive: false,
      trailingSlash: 'never',
    });
    expect(await resolveRouteRequest('/About/', { registry })).toMatchObject({
      kind: 'redirect',
      to: '/about',
    });
  });
});
