import { bench, describe, expect } from 'vite-plus/test';
import { requireRole } from '@askrjs/auth';
import { createRouteRegistry, route } from '../../src/router';
import { resolveRequest } from '../../src/ssr';
import {
  tier2BenchOptions,
  createSelectionToggle,
  type BenchToggle,
} from '../shared/_shared';

type GuardMode = 'admin' | 'member';

const guardModeState = {
  current: 'admin' as GuardMode,
};

const auth = {
  resolve() {
    return {
      authenticated: true,
      principal:
        guardModeState.current === 'admin'
          ? { roles: ['admin'] }
          : { roles: ['member'] },
      session: { id: 'session-1' },
      tenant: null,
    };
  },
};

const registry = createRouteRegistry(
  () => {
    route('/admin/{id}', ({ id }) => id, {
      auth: requireRole('admin'),
    });
  },
  { auth }
);

describe('tier2 subsystem router guard execution', () => {
  let guardToggle: BenchToggle<GuardMode> | null = null;

  const resolveGuardedRoute = () =>
    resolveRequest({ url: '/admin/123', registry });

  bench(
    'evaluate a role-guarded route request',
    async () => {
      guardModeState.current = guardToggle!.next();
      await resolveGuardedRoute();
    },
    {
      ...tier2BenchOptions,
      async setup() {
        guardToggle = createSelectionToggle('admin', 'member', 'first');

        const allowed = await resolveGuardedRoute();
        expect(allowed).toMatchObject({
          kind: 'render',
          params: { id: '123' },
        });

        guardModeState.current = 'member';
        const denied = await resolveGuardedRoute();
        expect(denied).toMatchObject({
          kind: 'deny',
          status: 403,
        });

        guardModeState.current = 'admin';
      },
      teardown() {
        guardToggle = null;
        guardModeState.current = 'admin';
      },
    }
  );
});
