import { describe, expect, it, vi } from 'vite-plus/test';
import {
  createRouteRegistry,
  lazyRouteData,
  resolveRouteRequest,
  route,
  RouteDataLoadError,
} from '../../../src/router';

describe('lazy route data', () => {
  it('should import only data owned by the matched route and cache its module', async () => {
    const loadHome = vi.fn(async () => ({ page: 'home' }));
    const loadDocs = vi.fn(async () => ({ page: 'docs' }));
    const registry = createRouteRegistry(() => {
      route('/home', () => null, {
        loader: lazyRouteData(loadHome),
      });
      route('/docs', () => null, {
        loader: lazyRouteData(loadDocs),
      });
    });

    expect(loadHome).not.toHaveBeenCalled();
    expect(loadDocs).not.toHaveBeenCalled();

    await resolveRouteRequest('/home', { registry, mode: 'spa' });
    expect(loadHome).toHaveBeenCalledTimes(1);
    expect(loadDocs).not.toHaveBeenCalled();

    await resolveRouteRequest('/docs', { registry, mode: 'spa' });
    await resolveRouteRequest('/docs', { registry, mode: 'spa' });
    expect(loadDocs).toHaveBeenCalledTimes(1);
  });

  it('should expose explicit preload without selecting route data', async () => {
    const select = vi.fn((module: { page: string }) => module.page);
    const loader = lazyRouteData(async () => ({ page: 'docs' }), select);

    await loader.preload();

    expect(select).not.toHaveBeenCalled();
  });

  it('should identify the route and client phase when loading fails', async () => {
    const cause = new Error('content chunk unavailable');
    const registry = createRouteRegistry(() => {
      route('/docs/reference', () => null, {
        loader: lazyRouteData(async () => {
          throw cause;
        }),
      });
    });

    await expect(
      resolveRouteRequest('/docs/reference', { registry, mode: 'spa' })
    ).rejects.toMatchObject({
      name: 'RouteDataLoadError',
      route: '/docs/reference',
      phase: 'client',
      cause,
    });
    await expect(
      resolveRouteRequest('/docs/reference', { registry, mode: 'spa' })
    ).rejects.toBeInstanceOf(RouteDataLoadError);
  });
});
