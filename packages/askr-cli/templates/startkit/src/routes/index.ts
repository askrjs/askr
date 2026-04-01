import { fallback, group, lazy } from '@askrjs/askr/router';
import App from '../pages/_layout';
import AuthLayout from '../pages/auth/_layout';
import AppLayout from '../pages/workspace/_layout';
import { registerAuthRoutes } from './auth';
import { registerPublicRoutes } from './public';
import { registerWorkspaceRoutes } from './workspace';

export function registerAppRoutes(): void {
  group({ layout: App }, () => {
    registerPublicRoutes();

    group({ layout: AuthLayout, auth: 'guest' }, () => {
      registerAuthRoutes();
    });

    group({ layout: AppLayout, auth: true }, () => {
      registerWorkspaceRoutes();
    });

    fallback(lazy(() => import('../pages/not-found')));
  });
}

export { registerAuthRoutes } from './auth';
export { registerPublicRoutes } from './public';
export { registerWorkspaceRoutes } from './workspace';
