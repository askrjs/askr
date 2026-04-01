import type { RouteAuthOptions } from '@askrjs/askr/router';
import { getSessionEmail } from '../lib/mock-data';
import {
  dashboardRoute,
  loginRoute,
  normalizeProtectedRouteTarget,
} from '../lib/routes';

export const routeAuth: RouteAuthOptions = {
  resolve: () => {
    const email = getSessionEmail();

    if (!email) {
      return {
        session: null,
        user: null,
      };
    }

    const identity = { email };

    return {
      session: identity,
      user: identity,
    };
  },
  loginPath: loginRoute.href,
  guestRedirectTo: ({ search }) => {
    const nextTarget = new URLSearchParams(search).get('next');
    const resolvedTarget = normalizeProtectedRouteTarget(nextTarget);
    return resolvedTarget || dashboardRoute.href;
  },
};
