import { layout, lazy, route } from '@askrjs/askr/router';
import App from './app';
import AppLayout from './layouts/app-layout';
import AuthLayout from './layouts/auth-layout';
import { isAuthenticated } from './lib/mock-data';

layout(App, () => {
  route(
    '/',
    lazy(() => import('./pages/landing')),
  );

  layout(AuthLayout, () => {
    route(
      '/login',
      lazy(() => import('./pages/login')),
      {
        guard: () => (isAuthenticated() ? '/dashboard' : true),
      },
    );
  });

  layout(AppLayout, () => {
    route(
      '/dashboard',
      lazy(() => import('./pages/dashboard')),
      {
        guard: () => (isAuthenticated() ? true : '/login'),
      },
    );

    route(
      '/accounts',
      lazy(() => import('./pages/accounts')),
      {
        guard: () => (isAuthenticated() ? true : '/login'),
      },
    );

    route(
      '/settings',
      lazy(() => import('./pages/settings')),
      {
        guard: () => (isAuthenticated() ? true : '/login'),
      },
    );
  });

  route(
    '/*',
    lazy(() => import('./pages/not-found')),
  );
});
