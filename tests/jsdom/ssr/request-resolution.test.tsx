import { describe, it, expect, beforeEach } from 'vite-plus/test';
import {
  getManifest,
  clearRoutes,
  registerRoutes,
  route,
} from '../../../src/router/route';
import { resolveRequest } from '../../../src/ssr';

describe('SSR request resolution', () => {
  beforeEach(() => {
    clearRoutes();
  });

  it('should redirect protected requests before render', async () => {
    registerRoutes(
      () => {
        route('/login', () => <div>{'login'}</div>, { auth: 'guest' });
        route('/dashboard', () => <div>{'dashboard'}</div>, { auth: true });
      },
      {
        auth: {
          resolve: () => ({ session: null, user: null }),
          loginPath: '/login',
        },
      }
    );

    const result = await resolveRequest({
      url: '/dashboard?tab=usage',
      manifest: getManifest(),
    });

    expect(result).toEqual({
      kind: 'redirect',
      to: '/login?next=%2Fdashboard%3Ftab%3Dusage',
      replace: false,
    });
  });

  it('should deny role-gated requests before render', async () => {
    registerRoutes(
      () => {
        route('/admin', () => <div>{'admin'}</div>, { role: 'admin' });
      },
      {
        auth: {
          resolve: () => ({
            session: { id: 'session_1' },
            user: { roles: ['member'] },
          }),
        },
      }
    );

    const result = await resolveRequest({
      url: '/admin',
      manifest: getManifest(),
    });

    expect(result).toEqual({
      kind: 'deny',
      status: 403,
    });
  });

  it('should render plain route tables when no manifest is provided', async () => {
    const handler = () => <div>{'home'}</div>;

    const result = await resolveRequest({
      url: '/',
      routes: [{ path: '/', handler }],
    });

    expect(result).toEqual({
      kind: 'render',
      handler,
      params: {},
    });
  });
});
